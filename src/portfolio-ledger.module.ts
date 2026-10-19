import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  GoalMovement,
  GoalMovementSchema,
} from './goals-movements/entity/goals-movements.entity';
import { GoalsModule } from './goals/goals.module';
import {
  InvestmentOperation,
  InvestmentOperationSchema,
} from './investment-operations/entity/investment-operations.entity';
import { PortfolioLedgerService } from './portfolio-ledger.service';
import {
  CryptoTransferEntry,
  CryptoTransferEntrySchema,
} from './transfers/entity/crypto-transfer-entry.entity';
import {
  TransferEntry,
  TransferEntrySchema,
} from './transfers/entity/transfer-entry.entity';

@Module({
  imports: [
    GoalsModule,
    MongooseModule.forFeature([
      { name: CryptoTransferEntry.name, schema: CryptoTransferEntrySchema },
      { name: TransferEntry.name, schema: TransferEntrySchema },
      { name: GoalMovement.name, schema: GoalMovementSchema },
      { name: InvestmentOperation.name, schema: InvestmentOperationSchema },
    ]),
  ],
  providers: [PortfolioLedgerService],
  exports: [PortfolioLedgerService],
})
export class PortfolioLedgerModule {}
