export const VERIFICATION_PURPOSES = [
  'registration',
  'unblock',
  'email_change',
] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export interface IJwtPayload {
  sub: string;
  email: string;
  tokenType: 'access' | 'refresh' | 'password_change';
  sessionId?: string;
}

export interface IAuthenticatedUser {
  userId: string;
  email: string;
}

export interface IUserResponse {
  id: string;
  name: string;
  email: string;
  isValidated: boolean;
  isDisabled: boolean;
  isBlocked: boolean;
  passwordChangeRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IAuthResponse {
  user: IUserResponse;
  accessToken?: string;
  refreshToken?: string;
  passwordChangeToken?: string;
  verificationCode?: string;
}
