export const VERIFICATION_PURPOSES = [
  'registration',
  'unblock',
  'email_change',
] as const;
export type VerificationPurpose = (typeof VERIFICATION_PURPOSES)[number];

export const ACCOUNT_DEACTIVATION_REASONS = [
  'no_longer_needed',
  'missing_features',
  'difficult_to_use',
  'privacy_concerns',
  'technical_issues',
  'other',
] as const;
export type AccountDeactivationReason =
  (typeof ACCOUNT_DEACTIVATION_REASONS)[number];

export const CURRENT_TERMS_VERSION = '1.0.0';

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
}
