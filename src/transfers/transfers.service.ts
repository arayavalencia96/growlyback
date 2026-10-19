import {
  Injectable,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import type { TransferSetupStatus } from './transfer.contracts';

@Injectable()
export class TransfersService implements OnModuleInit {
  private enabled = false;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit(): Promise<void> {
    const session = await this.connection.startSession();
    try {
      const database = this.connection.db;
      if (!database) throw new Error('Base de datos no disponible.');
      const hello: { setName?: string; msg?: string } = await database
        .admin()
        .command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid')
        throw new Error('Las transferencias requieren transacciones MongoDB.');
      await session.withTransaction(
        async () => {
          for (const collection of [
            'goals',
            'goal_movements',
            'investment_operations',
            'transfers',
            'transfer_entries',
            'crypto_transfer_entries',
          ])
            await database
              .collection(collection)
              .findOne({ _id: { $exists: false } }, { session });
        },
        { readConcern: { level: 'snapshot' }, readPreference: 'primary' },
      );
      this.enabled = true;
    } finally {
      await session.endSession();
    }
  }
  status(): TransferSetupStatus {
    return {
      stage: 8,
      enabled: this.enabled,
      execution: 'record-only',
      currencies: ['ARS', 'USD'],
      assets: 'trusted-crypto-catalog-only',
      maximumCryptoScale: 8,
      sameUnitCommission: true,
      sameGoalAllowed: true,
      sameEndpointAllowed: false,
      conversionAllowed: false,
      backdatingAllowed: false,
      cashyBudgetEffect: 'none',
      coordinator: 'multi-goal',
      requiredCapabilities: [
        'multi-document-transactions',
        'multi-collection-transactions',
        'atomic-cross-goal-ledger',
      ],
    };
  }

  assertEnabled(): void {
    if (this.enabled) return;
    throw new ServiceUnavailableException({
      code: 'TRANSFERS_NOT_ENABLED',
      message: 'Las transferencias todavía no están habilitadas.',
    });
  }
}
