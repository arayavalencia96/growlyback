import { Injectable, Logger } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { TransfersRepository } from './transfers.repository';
import { CashTransfersService } from './cash-transfers.service';
import { CryptoTransfersService } from './crypto-transfers.service';
import type { TransferIntent, TransferRecord } from './transfer.contracts';

@Injectable()
export class TransferSubmissionService {
  private readonly processing = new Set<string>();
  private readonly logger = new Logger(TransferSubmissionService.name);
  constructor(
    private readonly gate: TransfersService,
    private readonly records: TransfersRepository,
    private readonly cash: CashTransfersService,
    private readonly crypto: CryptoTransfersService,
  ) {}

  async submit(userId: string, input: TransferIntent): Promise<TransferRecord> {
    this.gate.assertEnabled();
    const { record } = await this.records.accept(userId, input);
    this.process(record);
    return this.view(record);
  }
  async retry(userId: string, id: string): Promise<TransferRecord> {
    this.gate.assertEnabled();
    const record = await this.records.findOne(userId, id);
    this.process(record);
    return this.view(record);
  }
  view(record: TransferRecord): TransferRecord {
    return {
      ...record,
      processing: record.status === 'pending' && this.processing.has(record.id),
    };
  }
  private process(record: TransferRecord): void {
    if (record.status !== 'pending' || this.processing.has(record.id)) return;
    this.processing.add(record.id);
    setImmediate(() => {
      const operation = Promise.resolve().then(() =>
        record.intent.kind === 'cash'
          ? this.cash.execute(record.userId, record.id)
          : this.crypto.execute(record.userId, record.id),
      );
      void operation
        .catch(() =>
          this.logger.warn({
            message:
              'No se pudo confirmar la finalización. Consultar o reintentar la misma transferencia.',
            transferId: record.id,
          }),
        )
        .finally(() => this.processing.delete(record.id));
    });
  }
}
