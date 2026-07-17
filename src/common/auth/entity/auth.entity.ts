import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { VERIFICATION_PURPOSES } from '../interfaces/auth.interface';
import type { VerificationPurpose } from '../interfaces/auth.interface';

@Schema({ timestamps: true, collection: 'users', versionKey: false })
export class User {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
  })
  email: string;
  @Prop({ required: true, select: false }) passwordHash: string;
  @Prop({ default: false, index: true }) isValidated: boolean;
  @Prop({ default: false, index: true }) isDisabled: boolean;
  @Prop({ default: false, index: true }) isBlocked: boolean;
  @Prop({ default: false }) passwordChangeRequired: boolean;
  @Prop({ default: 0 }) failedLoginAttempts: number;
  @Prop({ type: String, select: false, default: null }) verificationCodeHash?:
    string | null;
  @Prop({ type: Date, default: null }) verificationCodeExpiresAt?: Date | null;
  @Prop({ type: String, enum: VERIFICATION_PURPOSES, default: null })
  verificationPurpose?: VerificationPurpose | null;
  @Prop({ type: String, lowercase: true, trim: true, default: null })
  pendingEmail?: string | null;
  @Prop({ type: String, select: false, default: null })
  passwordResetTokenHash?: string | null;
  @Prop({ type: Date, default: null })
  passwordResetExpiresAt?: Date | null;
  @Prop({ type: Date, default: null })
  passwordResetRequestedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);

@Schema({ timestamps: true, collection: 'auth_sessions', versionKey: false })
export class AuthSession {
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, select: false }) refreshTokenHash: string;
  @Prop({ required: true }) expiresAt: Date;
  @Prop({ type: Date, default: null, index: true }) revokedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthSessionDocument = HydratedDocument<AuthSession>;
export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
