import { Module } from '@nestjs/common';
import { GoalsModule } from './goals/goals.module';
import { SummariesModule } from './summaries/summaries.module';
import { InvestmentOperationsModule } from './investment-operations/investment-operations.module';
import { GoalsMovementsModule } from './goals-movements/goals-movements.module';
import { CommonModule } from './common/common.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from './common/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    AuthModule,
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
