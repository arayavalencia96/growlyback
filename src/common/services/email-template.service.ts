import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import type {
  EmailTemplateContext,
  EmailTemplateName,
} from '../interfaces/email.interface';

@Injectable()
export class EmailTemplateService {
  private readonly templates = new Map<
    EmailTemplateName,
    Handlebars.TemplateDelegate<EmailTemplateContext>
  >();

  async render(
    templateName: EmailTemplateName,
    context: EmailTemplateContext,
  ): Promise<string> {
    let template = this.templates.get(templateName);
    if (!template) {
      try {
        const source = await readFile(
          join(__dirname, '..', 'templates', `${templateName}.hbs`),
          'utf8',
        );
        template = Handlebars.compile<EmailTemplateContext>(source, {
          strict: true,
          noEscape: false,
        });
        this.templates.set(templateName, template);
      } catch {
        throw new InternalServerErrorException(
          `Email template ${templateName} could not be loaded`,
        );
      }
    }
    return template(context);
  }
}
