import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { MongooseModule } from '@nestjs/mongoose';
import { Goal, GoalSchema } from '../goals/entity/goals.entity';
import { Transfer, TransferSchema } from './entity/transfer.entity';
import { TransfersRepository } from './transfers.repository';
import { CashTransfersService } from './cash-transfers.service';
import {
  TransferEntry,
  TransferEntrySchema,
} from './entity/transfer-entry.entity';
import {
  GoalMovement,
  GoalMovementSchema,
} from '../goals-movements/entity/goals-movements.entity';
import {
  InvestmentOperation,
  InvestmentOperationSchema,
} from '../investment-operations/entity/investment-operations.entity';
import { CommonModule } from '../common/common.module';
import { PortfolioLedgerModule } from '../portfolio-ledger.module';
import {
  CryptoTransferEntry,
  CryptoTransferEntrySchema,
} from './entity/crypto-transfer-entry.entity';
import { TransferExecutionService } from './transfer-execution.service';
import { CryptoTransfersService } from './crypto-transfers.service';
import { TransferFormService } from './transfer-form.service';
import { TransferSubmissionService } from './transfer-submission.service';

@Module({
  imports: [
    CommonModule,
    PortfolioLedgerModule,
    MongooseModule.forFeature([
      { name: Transfer.name, schema: TransferSchema },
      { name: Goal.name, schema: GoalSchema },
      { name: TransferEntry.name, schema: TransferEntrySchema },
      { name: CryptoTransferEntry.name, schema: CryptoTransferEntrySchema },
      { name: GoalMovement.name, schema: GoalMovementSchema },
      { name: InvestmentOperation.name, schema: InvestmentOperationSchema },
    ]),
  ],
  controllers: [TransfersController],
  providers: [
    TransfersService,
    TransfersRepository,
    CashTransfersService,
    TransferExecutionService,
    CryptoTransfersService,
    TransferFormService,
    TransferSubmissionService,
  ],
  exports: [TransfersRepository, CashTransfersService, CryptoTransfersService],
})
export class TransfersModule {}
