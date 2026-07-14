import { Module } from '@nestjs/common';
import { GoalsMovementsModule } from '../goals-movements/goals-movements.module';
import { GoalsModule } from '../goals/goals.module';
import { InvestmentOperationsModule } from '../investment-operations/investment-operations.module';
import { SummariesService } from './summaries.service';
import { SummariesController } from './summaries.controller';

@Module({
  imports: [GoalsModule, GoalsMovementsModule, InvestmentOperationsModule],
  controllers: [SummariesController],
  providers: [SummariesService],
  exports: [SummariesService],
})
export class SummariesModule {}
