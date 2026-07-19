import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonModule } from '../common/common.module';
import { GoalsModule } from '../goals/goals.module';
import { PortfolioLedgerModule } from '../portfolio-ledger.module';
import {
  InvestmentOperation,
  InvestmentOperationSchema,
} from './entity/investment-operations.entity';
import { InvestmentOperationsService } from './investment-operations.service';
import { InvestmentOperationsController } from './investment-operations.controller';

@Module({
  imports: [
    CommonModule,
    GoalsModule,
    PortfolioLedgerModule,
    MongooseModule.forFeature([
      { name: InvestmentOperation.name, schema: InvestmentOperationSchema },
    ]),
  ],
  controllers: [InvestmentOperationsController],
  providers: [InvestmentOperationsService],
  exports: [InvestmentOperationsService, MongooseModule],
})
export class InvestmentOperationsModule {}
