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

import { MongooseModule } from '@nestjs/mongoose';
import { Goal, GoalSchema } from '../goals/entity/goals.entity';
import { LedgerCoordinator } from './services/ledger-coordinator.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Goal.name, schema: GoalSchema }]),
  ],
  providers: [
    LedgerCoordinator,
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
  exports: [DatabaseService, EmailService, LedgerCoordinator],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpContextMiddleware).forRoutes('*');
  }
}
