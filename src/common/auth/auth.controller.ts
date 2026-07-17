import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { IResult } from '../interfaces/common.interface';
import { AuthService } from './auth.service';
import {
  ChangeBlockedPasswordDto,
  ForgotPasswordDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  RegisterDto,
  RequestVerificationCodeDto,
  ResetPasswordDto,
  UpdateProfileDto,
  VerifyCodeDto,
} from './dto/auth.dto';
import {
  IAuthenticatedUser,
  IAuthResponse,
  IUserResponse,
} from './interfaces/auth.interface';
import { JwtAuthGuard } from './jwt.auth.guard';
import { Public } from './public.decorator';

type AuthenticatedRequest = Request & { user: IAuthenticatedUser };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiCreatedResponse()
  async register(@Body() dto: RegisterDto): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.register(dto),
      'User registered successfully',
      HttpStatus.CREATED,
    );
  }

  @Public()
  @Post('verification-code')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async requestCode(
    @Body() dto: RequestVerificationCodeDto,
  ): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.requestVerificationCode(dto.email),
      'Verification code generated',
      HttpStatus.OK,
    );
  }

  @Public()
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async verifyCode(
    @Body() dto: VerifyCodeDto,
  ): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.verifyCode(dto),
      'Code verified successfully',
      HttpStatus.OK,
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async login(@Body() dto: LoginDto): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.login(dto),
      'Login successful',
      HttpStatus.OK,
    );
  }

  @Public()
  @Post('change-blocked-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async changeBlockedPassword(
    @Body() dto: ChangeBlockedPasswordDto,
  ): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.changeBlockedPassword(dto),
      'Password changed successfully',
      HttpStatus.OK,
    );
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<IResult<null>> {
    await this.authService.forgotPassword(dto.email);
    return {
      result: null,
      message: 'Password reset email requested',
      description:
        'If the account is eligible, password reset instructions were sent',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.resetPassword(dto),
      'Password reset successfully',
      HttpStatus.OK,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async refresh(@Body() dto: RefreshTokenDto): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.refresh(dto.refreshToken),
      'Session refreshed successfully',
      HttpStatus.OK,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse()
  async logout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: LogoutDto,
  ): Promise<IResult<IUserResponse>> {
    return {
      result: await this.authService.logout(request.user, dto.refreshToken),
      message: 'Logout successful',
      description: 'The session was revoked',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse()
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<IResult<IAuthResponse>> {
    return this.response(
      await this.authService.updateProfile(request.user, dto),
      'Profile updated successfully',
      HttpStatus.OK,
    );
  }

  @Delete('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse()
  async disable(
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<IUserResponse>> {
    return {
      result: await this.authService.disable(request.user),
      message: 'User disabled successfully',
      description: 'The account was logically disabled',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  private response(
    result: IAuthResponse,
    message: string,
    statuscode: number,
  ): IResult<IAuthResponse> {
    return {
      result,
      message,
      description: 'Authentication operation completed',
      statuscode,
      ok: true,
    };
  }
}
