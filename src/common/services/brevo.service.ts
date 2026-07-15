import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import type { ISendEmailInput } from '../interfaces/email.interface';

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);
  private client?: BrevoClient;

  constructor(private readonly configService: ConfigService) {}

  async send(input: ISendEmailInput): Promise<void> {
    const senderEmail =
      this.configService.getOrThrow<string>('BREVO_SENDER_EMAIL');
    const senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') ?? 'Growly';
    const supportEmail = this.configService.get<string>('MAIL_SUPPORT');
    try {
      await this.getClient().transactionalEmails.sendTransacEmail({
        sender: { email: senderEmail, name: senderName },
        to: [input.recipient],
        subject: input.subject,
        htmlContent: input.htmlContent,
        textContent: input.textContent,
        tags: input.tags,
        ...(supportEmail
          ? { replyTo: { email: supportEmail, name: senderName } }
          : {}),
      });
    } catch (error: unknown) {
      this.logger.error(
        `Brevo delivery failed for ${input.recipient.email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'Email delivery is temporarily unavailable',
      );
    }
  }

  private getClient(): BrevoClient {
    this.client ??= new BrevoClient({
      apiKey: this.configService.getOrThrow<string>('BREVO_API_KEY'),
      timeoutInSeconds: 30,
      maxRetries: 2,
    });
    return this.client;
  }
}
