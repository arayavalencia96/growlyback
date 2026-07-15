import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Model } from 'mongoose';
import { EmailService } from '../services/email.service';
import {
  ChangeBlockedPasswordDto,
  LoginDto,
  RegisterDto,
  UpdateProfileDto,
  VerifyCodeDto,
} from './dto/auth.dto';
import {
  AuthSession,
  AuthSessionDocument,
  User,
  UserDocument,
} from './entity/auth.entity';
import {
  IAuthResponse,
  IAuthenticatedUser,
  IJwtPayload,
  IUserResponse,
  VerificationPurpose,
} from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly codeLifetimeMs = 30 * 60 * 1000;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(AuthSession.name)
    private readonly sessionModel: Model<AuthSessionDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<IAuthResponse> {
    const email = dto.email.trim().toLowerCase();
    if (await this.userModel.exists({ email }))
      throw new ConflictException('Email is already registered');
    const user = await this.userModel.create({
      name: dto.name.trim(),
      email,
      passwordHash: await bcrypt.hash(dto.password, 12),
    });
    const code = await this.assignVerificationCode(user, 'registration');
    await this.sendCodeEmail(user, code, 'registration', false);
    return { user: this.mapUser(user), ...this.developmentCode(code) };
  }

  async requestVerificationCode(emailValue: string): Promise<IAuthResponse> {
    const email = emailValue.trim().toLowerCase();
    const user = await this.userModel
      .findOne({ $or: [{ email }, { pendingEmail: email }] })
      .select('+verificationCodeHash');
    if (!user || user.isDisabled)
      throw new BadRequestException('Verification code cannot be requested');
    const purpose: VerificationPurpose = user.isBlocked
      ? 'unblock'
      : user.pendingEmail === email
        ? 'email_change'
        : 'registration';
    if (purpose === 'registration' && user.isValidated)
      throw new BadRequestException('User is already validated');
    const code = await this.assignVerificationCode(user, purpose);
    await this.sendCodeEmail(user, code, purpose, true);
    return { user: this.mapUser(user), ...this.developmentCode(code) };
  }

  async verifyCode(dto: VerifyCodeDto): Promise<IAuthResponse> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel
      .findOne({ $or: [{ email }, { pendingEmail: email }] })
      .select('+verificationCodeHash');
    if (
      !user?.verificationCodeHash ||
      !user.verificationCodeExpiresAt ||
      user.verificationCodeExpiresAt.getTime() < Date.now()
    )
      throw new BadRequestException('Verification code is invalid or expired');
    if (!(await bcrypt.compare(dto.code, user.verificationCodeHash)))
      throw new BadRequestException('Verification code is invalid or expired');
    const purpose = user.verificationPurpose;
    user.verificationCodeHash = null;
    user.verificationCodeExpiresAt = null;
    user.verificationPurpose = null;
    if (purpose === 'registration') user.isValidated = true;
    if (purpose === 'email_change' && user.pendingEmail) {
      user.email = user.pendingEmail;
      user.pendingEmail = null;
    }
    if (purpose === 'unblock') {
      user.isBlocked = false;
      user.failedLoginAttempts = 0;
      user.passwordChangeRequired = true;
    }
    await user.save();
    if (purpose === 'registration') {
      try {
        await this.emailService.sendWelcome({
          email: user.email,
          name: user.name,
        });
      } catch (error: unknown) {
        this.logger.warn(
          `Welcome email could not be delivered to ${user.email}`,
          error instanceof Error ? error.message : undefined,
        );
      }
    }
    const passwordChangeToken =
      purpose === 'unblock'
        ? await this.signToken(user, 'password_change')
        : undefined;
    if (passwordChangeToken) {
      await this.sendPasswordResetEmail(user, passwordChangeToken);
    }
    return {
      user: this.mapUser(user),
      ...(passwordChangeToken ? { passwordChangeToken } : {}),
    };
  }

  async login(dto: LoginDto): Promise<IAuthResponse> {
    const user = await this.userModel
      .findOne({ email: dto.email.trim().toLowerCase() })
      .select('+passwordHash');
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.isDisabled) throw new ForbiddenException('User is disabled');
    if (!user.isValidated)
      throw new ForbiddenException('Email is not validated');
    if (user.isBlocked) throw new ForbiddenException('User is blocked');
    if (user.passwordChangeRequired)
      throw new ForbiddenException('Password change is required');
    if (!(await bcrypt.compare(dto.password, user.passwordHash))) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 3) {
        user.isBlocked = true;
        user.passwordChangeRequired = true;
        const code = await this.assignVerificationCode(user, 'unblock');
        await this.sessionModel.updateMany(
          { userId: user._id.toString(), revokedAt: null },
          { revokedAt: new Date() },
        );
        try {
          await this.sendCodeEmail(user, code, 'unblock', false);
        } catch (error: unknown) {
          this.logger.warn(
            `Blocked account email could not be delivered to ${user.email}`,
            error instanceof Error ? error.message : undefined,
          );
        }
        throw new ForbiddenException(
          'User was blocked after three failed attempts',
        );
      }
      await user.save();
      throw new UnauthorizedException('Invalid credentials');
    }
    user.failedLoginAttempts = 0;
    await user.save();
    return {
      user: this.mapUser(user),
      ...(await this.issueTokenPair(user)),
    };
  }

  async changeBlockedPassword(
    dto: ChangeBlockedPasswordDto,
  ): Promise<IAuthResponse> {
    let payload: IJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<IJwtPayload>(
        dto.passwordChangeToken,
      );
    } catch {
      throw new UnauthorizedException('Invalid password change token');
    }
    if (payload.tokenType !== 'password_change')
      throw new UnauthorizedException('Invalid password change token');
    const user = await this.userModel
      .findById(payload.sub)
      .select('+passwordHash');
    if (!user || user.isDisabled || !user.passwordChangeRequired)
      throw new UnauthorizedException('Invalid password change token');
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.passwordChangeRequired = false;
    user.isBlocked = false;
    user.failedLoginAttempts = 0;
    await user.save();
    await this.sessionModel.updateMany(
      { userId: user._id.toString(), revokedAt: null },
      { revokedAt: new Date() },
    );
    return {
      user: this.mapUser(user),
      ...(await this.issueTokenPair(user)),
    };
  }

  async refresh(refreshToken: string): Promise<IAuthResponse> {
    let payload: IJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<IJwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.tokenType !== 'refresh' || !payload.sessionId)
      throw new UnauthorizedException('Invalid refresh token');
    const session = await this.sessionModel
      .findById(payload.sessionId)
      .select('+refreshTokenHash');
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    )
      throw new UnauthorizedException('Session is expired or revoked');
    if (!(await bcrypt.compare(refreshToken, session.refreshTokenHash))) {
      session.revokedAt = new Date();
      await session.save();
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    const user = await this.userModel.findById(payload.sub);
    if (
      !user ||
      user.isDisabled ||
      user.isBlocked ||
      !user.isValidated ||
      user.passwordChangeRequired
    )
      throw new UnauthorizedException('User cannot refresh the session');
    return {
      user: this.mapUser(user),
      ...(await this.rotateTokenPair(user, session)),
    };
  }

  async logout(
    authenticated: IAuthenticatedUser,
    refreshToken: string,
  ): Promise<IUserResponse> {
    try {
      const payload = await this.jwtService.verifyAsync<IJwtPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
          ignoreExpiration: true,
        },
      );
      if (payload.sessionId && payload.sub === authenticated.userId)
        await this.sessionModel.updateOne(
          { _id: payload.sessionId, userId: authenticated.userId },
          { revokedAt: new Date() },
        );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.userModel.findById(authenticated.userId);
    if (!user) throw new UnauthorizedException();
    return this.mapUser(user);
  }

  async updateProfile(
    authenticated: IAuthenticatedUser,
    dto: UpdateProfileDto,
  ): Promise<IAuthResponse> {
    const user = await this.userModel
      .findById(authenticated.userId)
      .select('+passwordHash');
    if (!user) throw new UnauthorizedException();
    if (
      (dto.email || dto.newPassword) &&
      (!dto.currentPassword ||
        !(await bcrypt.compare(dto.currentPassword, user.passwordHash)))
    )
      throw new UnauthorizedException('Current password is invalid');
    if (dto.name) user.name = dto.name.trim();
    if (dto.newPassword)
      user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    let code: string | undefined;
    if (dto.email && dto.email.trim().toLowerCase() !== user.email) {
      const pendingEmail = dto.email.trim().toLowerCase();
      if (await this.userModel.exists({ email: pendingEmail }))
        throw new ConflictException('Email is already registered');
      user.pendingEmail = pendingEmail;
      code = await this.assignVerificationCode(user, 'email_change');
      await this.sendCodeEmail(user, code, 'email_change', false);
    } else {
      await user.save();
    }
    return {
      user: this.mapUser(user),
      ...(code ? this.developmentCode(code) : {}),
    };
  }

  async disable(authenticated: IAuthenticatedUser): Promise<IUserResponse> {
    const user = await this.userModel.findById(authenticated.userId);
    if (!user) throw new UnauthorizedException();
    user.isDisabled = true;
    await user.save();
    await this.sessionModel.updateMany(
      { userId: authenticated.userId, revokedAt: null },
      { revokedAt: new Date() },
    );
    return this.mapUser(user);
  }

  async validateAccessUser(payload: IJwtPayload): Promise<IAuthenticatedUser> {
    if (payload.tokenType !== 'access') throw new UnauthorizedException();
    if (!payload.sessionId) throw new UnauthorizedException();
    const session = await this.sessionModel.exists({
      _id: payload.sessionId,
      userId: payload.sub,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!session) throw new UnauthorizedException();
    const user = await this.userModel.findById(payload.sub);
    if (
      !user ||
      user.isDisabled ||
      user.isBlocked ||
      !user.isValidated ||
      user.passwordChangeRequired
    )
      throw new UnauthorizedException();
    return { userId: user._id.toString(), email: user.email };
  }

  private async assignVerificationCode(
    user: UserDocument,
    purpose: VerificationPurpose,
  ): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    user.verificationCodeHash = await bcrypt.hash(code, 10);
    user.verificationCodeExpiresAt = new Date(Date.now() + this.codeLifetimeMs);
    user.verificationPurpose = purpose;
    await user.save();
    return code;
  }

  private async sendCodeEmail(
    user: UserDocument,
    code: string,
    purpose: VerificationPurpose,
    isResend: boolean,
  ): Promise<void> {
    const expiresAt = user.verificationCodeExpiresAt;
    if (!expiresAt) {
      throw new BadRequestException('Verification code expiration is missing');
    }

    if (purpose === 'unblock') {
      await this.emailService.sendBlockedCode({
        email: user.email,
        name: user.name,
        code,
        expiresAt,
        isResend,
      });
      return;
    }

    await this.emailService.sendVerificationCode({
      email:
        purpose === 'email_change' && user.pendingEmail
          ? user.pendingEmail
          : user.email,
      name: user.name,
      code,
      purpose,
      expiresAt,
    });
  }

  private async sendPasswordResetEmail(
    user: UserDocument,
    passwordChangeToken: string,
  ): Promise<void> {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_PASSWORD_RESET_URL',
    );
    if (!frontendUrl) {
      this.logger.warn(
        'FRONTEND_PASSWORD_RESET_URL is not configured; reset email skipped',
      );
      return;
    }

    const resetUrl = new URL(frontendUrl);
    resetUrl.searchParams.set('token', passwordChangeToken);
    try {
      await this.emailService.sendPasswordReset({
        email: user.email,
        name: user.name,
        resetLink: resetUrl.toString(),
        expiresAt: new Date(Date.now() + this.codeLifetimeMs),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Password reset email could not be delivered to ${user.email}`,
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  private signToken(
    user: UserDocument,
    tokenType: IJwtPayload['tokenType'],
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user._id.toString(), email: user.email, tokenType },
      tokenType === 'password_change' ? { expiresIn: '30m' } : undefined,
    );
  }

  private async issueTokenPair(
    user: UserDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const session = await this.sessionModel.create({
      userId: user._id.toString(),
      refreshTokenHash: 'pending',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    return this.rotateTokenPair(user, session);
  }

  private async rotateTokenPair(
    user: UserDocument,
    session: AuthSessionDocument,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.jwtService.signAsync({
      sub: user._id.toString(),
      email: user.email,
      tokenType: 'access',
      sessionId: session._id.toString(),
    });
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user._id.toString(),
        email: user.email,
        tokenType: 'refresh',
        sessionId: session._id.toString(),
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );
    session.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    session.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await session.save();
    return { accessToken, refreshToken };
  }

  private developmentCode(code: string): { verificationCode?: string } {
    return this.configService.get<string>('EXPOSE_VERIFICATION_CODE') !== 'true'
      ? {}
      : { verificationCode: code };
  }

  private mapUser(user: UserDocument): IUserResponse {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      isValidated: user.isValidated,
      isDisabled: user.isDisabled,
      isBlocked: user.isBlocked,
      passwordChangeRequired: user.passwordChangeRequired,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
