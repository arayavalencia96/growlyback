import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_MESSAGE =
  'Password must contain at least 8 characters, one uppercase letter, one number and one special character';

export class RegisterDto {
  @ApiProperty() @IsString() name: string;

  @ApiProperty() @IsEmail() email: string;

  @ApiProperty()
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  password: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
}

export class RequestVerificationCodeDto {
  @ApiProperty({ example: 'usuario@growly.com' })
  @IsEmail()
  email: string;
}

export class VerifyCodeDto {
  @ApiProperty({ example: 'usuario@growly.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must contain exactly 6 digits' })
  code: string;
}

export class ChangeBlockedPasswordDto {
  @ApiProperty() @IsString() passwordChangeToken: string;
  @ApiProperty()
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty() @IsEmail() email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() resetToken: string;
  @ApiProperty()
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class LogoutDto extends RefreshTokenDto {}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currentPassword?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_MESSAGE })
  newPassword?: string;
}
