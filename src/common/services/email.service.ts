import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ISendBlockedCodeEmailInput,
  ISendPasswordResetEmailInput,
  ISendVerificationCodeEmailInput,
  ISendWelcomeEmailInput,
} from '../interfaces/email.interface';
import { BrevoService } from './brevo.service';
import { EmailTemplateService } from './email-template.service';

@Injectable()
export class EmailService {
  private readonly ttlMinutes = 30;

  constructor(
    private readonly brevoService: BrevoService,
    private readonly templateService: EmailTemplateService,
    private readonly configService: ConfigService,
  ) {}

  async sendVerificationCode(
    input: ISendVerificationCodeEmailInput,
  ): Promise<void> {
    const isEmailChange = input.purpose === 'email_change';
    const htmlContent = await this.templateService.render('verification-code', {
      name: input.name,
      code: input.code,
      ttlMinutes: this.ttlMinutes,
      expiresAtFormatted: this.formatDate(input.expiresAt),
      isEmailChange,
      supportEmail: this.supportText(),
    });
    await this.brevoService.send({
      recipient: { email: input.email, name: input.name },
      subject: isEmailChange
        ? 'Confirma tu nuevo correo en Growly'
        : 'Verifica tu cuenta de Growly',
      htmlContent,
      textContent: `Tu codigo de verificacion es ${input.code}. Vence en ${this.ttlMinutes} minutos.`,
      tags: ['authentication', input.purpose],
    });
  }

  async sendBlockedCode(input: ISendBlockedCodeEmailInput): Promise<void> {
    const htmlContent = await this.templateService.render('user-blocked', {
      name: input.name,
      email: input.email,
      code: input.code,
      ttlMinutes: this.ttlMinutes,
      expiresAtFormatted: this.formatDate(input.expiresAt),
      isResend: input.isResend,
      supportEmail: this.supportText(),
    });
    await this.brevoService.send({
      recipient: { email: input.email, name: input.name },
      subject: input.isResend
        ? 'Nuevo codigo de desbloqueo de Growly'
        : 'Protegimos temporalmente tu cuenta de Growly',
      htmlContent,
      textContent: `Tu codigo de desbloqueo es ${input.code}. Vence en ${this.ttlMinutes} minutos.`,
      tags: ['authentication', 'account-blocked'],
    });
  }

  async sendPasswordReset(input: ISendPasswordResetEmailInput): Promise<void> {
    const htmlContent = await this.templateService.render('password-reset', {
      name: input.name,
      resetLink: input.resetLink,
      expiresAtFormatted: this.formatDate(input.expiresAt),
      supportEmail: this.supportText(),
    });
    await this.brevoService.send({
      recipient: { email: input.email, name: input.name },
      subject: 'Cambia tu contraseña de Growly',
      htmlContent,
      textContent: `Cambia tu contrasena desde este enlace: ${input.resetLink}`,
      tags: ['authentication', 'password-reset'],
    });
  }

  async sendWelcome(input: ISendWelcomeEmailInput): Promise<void> {
    const htmlContent = await this.templateService.render('welcome', {
      name: input.name,
      supportEmail: this.supportText(),
    });
    await this.brevoService.send({
      recipient: { email: input.email, name: input.name },
      subject: 'Te damos la bienvenida a Growly',
      htmlContent,
      textContent: `Hola ${input.name}. Tu cuenta de Growly ya esta lista para comenzar.`,
      tags: ['authentication', 'welcome'],
    });
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(date);
  }

  private supportText(): string {
    const supportEmail = this.configService.get<string>('MAIL_SUPPORT');
    return supportEmail
      ? `Si necesitas ayuda, escribenos a ${supportEmail}.`
      : 'Si necesitas ayuda, contacta al equipo de soporte de Growly.';
  }
}
