import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { HttpExceptionLoggingFilter } from './filters/http-exception-logging.filter';
import { HttpLoggingInterceptor } from './interceptors/http-logging.interceptor';
import { HttpContextMiddleware } from './middlewares/http-context.middleware';
import { DatabaseService } from './services/database.service';
import { BrevoService } from './services/brevo.service';
import { EmailService } from './services/email.service';
import { EmailTemplateService } from './services/email-template.service';
import { HttpLoggerService } from './services/http-logger.service';

@Global()
@Module({
  providers: [
    DatabaseService,
    BrevoService,
    EmailTemplateService,
    EmailService,
    HttpLoggerService,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionLoggingFilter,
    },
  ],
  exports: [DatabaseService, EmailService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpContextMiddleware).forRoutes('*');
  }
}
