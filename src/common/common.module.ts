import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './services/database.service';
import { BrevoService } from './services/brevo.service';
import { EmailService } from './services/email.service';
import { EmailTemplateService } from './services/email-template.service';

@Global()
@Module({
  providers: [
    DatabaseService,
    BrevoService,
    EmailTemplateService,
    EmailService,
  ],
  exports: [DatabaseService, EmailService],
})
export class CommonModule {}
