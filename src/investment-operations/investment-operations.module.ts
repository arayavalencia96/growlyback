import { Module } from '@nestjs/common';
import { InvestmentOperationsService } from './investment-operations.service';
import { InvestmentOperationsController } from './investment-operations.controller';

@Module({
  controllers: [InvestmentOperationsController],
  providers: [InvestmentOperationsService],
})
export class InvestmentOperationsModule {}
