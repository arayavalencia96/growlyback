import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TransferEntry,
  TransferEntrySchema,
} from '../transfers/entity/transfer-entry.entity';
import {
  CryptoTransferEntry,
  CryptoTransferEntrySchema,
} from '../transfers/entity/crypto-transfer-entry.entity';
import { GoalsMovementsModule } from '../goals-movements/goals-movements.module';
import { GoalsModule } from '../goals/goals.module';
import { InvestmentOperationsModule } from '../investment-operations/investment-operations.module';
import { SummariesService } from './summaries.service';
import { SummariesController } from './summaries.controller';

@Module({
  imports: [
    GoalsModule,
    GoalsMovementsModule,
    InvestmentOperationsModule,
    MongooseModule.forFeature([
      { name: TransferEntry.name, schema: TransferEntrySchema },
      { name: CryptoTransferEntry.name, schema: CryptoTransferEntrySchema },
    ]),
  ],
  controllers: [SummariesController],
  providers: [SummariesService],
  exports: [SummariesService],
})
export class SummariesModule {}
