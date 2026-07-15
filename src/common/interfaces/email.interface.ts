import type { VerificationPurpose } from '../auth/interfaces/auth.interface';

export type EmailTemplateName =
  'verification-code' | 'user-blocked' | 'password-reset' | 'welcome';

export interface IEmailRecipient {
  email: string;
  name: string;
}
export interface ISendEmailInput {
  recipient: IEmailRecipient;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
}
export interface ISendVerificationCodeEmailInput extends IEmailRecipient {
  code: string;
  purpose: Extract<VerificationPurpose, 'registration' | 'email_change'>;
  expiresAt: Date;
}
export interface ISendBlockedCodeEmailInput extends IEmailRecipient {
  code: string;
  expiresAt: Date;
  isResend: boolean;
}
export interface ISendPasswordResetEmailInput extends IEmailRecipient {
  resetLink: string;
  expiresAt: Date;
}
export type ISendWelcomeEmailInput = IEmailRecipient;
export type EmailTemplateContext = Record<string, string | number | boolean>;
