import { Module } from '@nestjs/common';
import { IntegrationModule } from './integration/integration.module';
import { GoalsModule } from './goals/goals.module';
import { SummariesModule } from './summaries/summaries.module';
import { InvestmentOperationsModule } from './investment-operations/investment-operations.module';
import { GoalsMovementsModule } from './goals-movements/goals-movements.module';
import { CommonModule } from './common/common.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './common/auth/auth.module';
import { HealthModule } from './health/health.module';
import { TransfersModule } from './transfers/transfers.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [
    AssetsModule,
    TransfersModule,
    IntegrationModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    AuthModule,
    HealthModule,
    GoalsModule,
    GoalsMovementsModule,
    InvestmentOperationsModule,
    SummariesModule,
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
