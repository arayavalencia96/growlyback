import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LedgerCoordinator } from '../common/services/ledger-coordinator.service';
import { transactionSessionForGoals } from '../common/services/ledger-context';
import { PortfolioLedgerService } from '../portfolio-ledger.service';
import { Goal, type GoalDocument } from '../goals/entity/goals.entity';
import { Transfer, type TransferDocument } from './entity/transfer.entity';
import { TransfersRepository } from './transfers.repository';
import type {
  TransferRecord,
  TransferBookValue,
  TransferErrorCode,
} from './transfer.contracts';

export interface TransferCompletion {
  delivered: TransferBookValue;
  commission: TransferBookValue;
}

function rejectionCode(response: unknown): TransferErrorCode {
  if (typeof response === 'object' && response !== null && 'code' in response) {
    switch (response.code) {
      case 'GOAL_UNAVAILABLE':
      case 'ASSET_NOT_TRANSFERABLE':
      case 'SOURCE_POSITION_MISSING':
      case 'INSUFFICIENT_BALANCE':
        return response.code;
    }
  }
  return 'INVALID_QUANTITY';
}

@Injectable()
export class TransferExecutionService {
  constructor(
    private readonly coordinator: LedgerCoordinator,
    private readonly repository: TransfersRepository,
    private readonly ledger: PortfolioLedgerService,
    @InjectModel(Transfer.name)
    private readonly transfers: Model<TransferDocument>,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
  ) {}
  async execute(
    userId: string,
    id: string,
    kind: 'cash' | 'crypto',
    apply: (record: TransferRecord) => Promise<TransferCompletion>,
  ): Promise<TransferRecord> {
    const original = await this.repository.findOne(userId, id);
    const transferId = original.id;
    if (original.intent.kind !== kind)
      throw new BadRequestException(
        'El tipo de transferencia no corresponde al ejecutor.',
      );
    if (original.status !== 'pending') return original;
    const goalIds = [
      original.intent.source.goalId,
      original.intent.destination.goalId,
    ];
    try {
      await this.coordinator.runMany(goalIds, userId, async () => {
        const session = transactionSessionForGoals(userId, goalIds);
        const record = await this.repository.findOne(userId, transferId);
        if (record.status !== 'pending') return;
        for (const goalId of new Set(goalIds))
          await this.ledger.validate(
            goalId,
            userId,
            undefined,
            undefined,
            kind === 'cash',
          );
        const bookValue = await apply(record);
        for (const goalId of new Set(goalIds))
          await this.ledger.validate(
            goalId,
            userId,
            undefined,
            undefined,
            kind === 'cash',
          );
        for (const goalId of new Set(goalIds))
          await this.goals.updateOne(
            { _id: goalId, userId },
            { $set: { hasTransferHistory: true } },
            { session },
          );
        const updated = await this.transfers.updateOne(
          { _id: record.id, userId, status: 'pending' },
          {
            $set: {
              status: 'completed',
              completedAt: new Date(),
              bookValue,
            },
          },
          { session, runValidators: true },
        );
        if (updated.modifiedCount !== 1)
          throw new ConflictException(
            'La solicitud cambió durante su ejecución.',
          );
      });
    } catch (error: unknown) {
      const response: unknown =
        error instanceof BadRequestException ||
        error instanceof ConflictException
          ? error.getResponse()
          : undefined;
      if (
        error instanceof BadRequestException ||
        (error instanceof ConflictException &&
          typeof response === 'object' &&
          response !== null &&
          'code' in response &&
          response.code === 'GOAL_UNAVAILABLE')
      ) {
        const code = rejectionCode(response);
        await this.transfers
          .updateOne(
            { _id: transferId, userId, status: 'pending' },
            { $set: { status: 'rejected', rejectionCode: code } },
            { runValidators: true },
          )
          .catch(() => {
            throw new ServiceUnavailableException({
              code: 'RESULT_UNKNOWN',
              message:
                'No se pudo confirmar el estado final. Consultá o reintentá con la misma clave.',
            });
          });
      } else
        throw new ServiceUnavailableException({
          code: 'RESULT_UNKNOWN',
          message:
            'Consultá el estado o reintentá esta misma operación. No crees otra transferencia.',
        });
    }
    return this.repository.findOne(userId, transferId);
  }
}
