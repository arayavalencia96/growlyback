import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { catalogAsset } from '../assets/asset-catalog';
import { Goal, type GoalDocument } from '../goals/entity/goals.entity';
import { goalReferences, unavailableGoal } from '../goals/goal-references';
import { ledgerSession } from '../common/services/ledger-context';
import { Transfer, type TransferDocument } from './entity/transfer.entity';
import { normalizeTransferIntent } from './transfer.rules';
import type { FindTransfersDto } from './dto/transfers.dto';
import type {
  NormalizedTransferIntent,
  TransferIntent,
  TransferRecord,
} from './transfer.contracts';

export interface TransferAcceptance {
  record: TransferRecord;
  replayed: boolean;
}

function duplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 11000
  );
}

@Injectable()
export class TransfersRepository implements OnModuleInit {
  constructor(
    @InjectModel(Transfer.name)
    private readonly transfers: Model<TransferDocument>,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.transfers.createIndexes();
  }

  async accept(
    userId: string,
    input: TransferIntent,
  ): Promise<TransferAcceptance> {
    if (ledgerSession())
      throw new ConflictException(
        'La solicitud debe registrarse antes de iniciar la transacción de ejecución.',
      );
    const intent = normalizeTransferIntent(
      input,
      input?.kind === 'crypto' ? catalogAsset(input.assetId) : undefined,
    );
    const previous = await this.byKey(userId, intent.idempotencyKey);
    if (previous) return this.replay(previous, intent);
    const goalIds = [
      ...new Set([intent.source.goalId, intent.destination.goalId]),
    ];
    const owned = await this.goals
      .countDocuments({
        _id: { $in: goalIds.map((id) => new Types.ObjectId(id)) },
        userId,
        status: 'active',
        deletedAt: null,
        cashyAdjustmentLock: { $in: [null, ''] },
      })
      .exec();
    if (owned !== goalIds.length)
      throw new ConflictException({
        code: 'GOAL_UNAVAILABLE',
        message:
          'Los objetivos deben pertenecer a tu cuenta, estar activos y no tener correcciones pendientes.',
      });
    const id = randomUUID();
    const now = new Date();
    try {
      const row = await this.transfers.create({
        _id: id,
        userId,
        idempotencyKey: intent.idempotencyKey,
        intent,
        status: 'pending',
        acceptedAt: now,
        effectiveAt: now,
        sourceEntryId: `${id}:source`,
        destinationEntryId: `${id}:destination`,
        ...(intent.feeUnits !== '0'
          ? { commissionEntryId: `${id}:commission` }
          : {}),
      });
      return { record: await this.mapOrFail(row), replayed: false };
    } catch (error: unknown) {
      if (duplicateKey(error)) {
        const existing = await this.byKey(userId, intent.idempotencyKey).catch(
          () => null,
        );
        if (existing) return this.replay(existing, intent);
      }
      throw new ServiceUnavailableException({
        code: 'RESULT_UNKNOWN',
        message:
          'No se pudo confirmar el registro de la solicitud. Consultá su estado o reintentá con la misma clave; no crees otra operación.',
      });
    }
  }

  async findOne(userId: string, id: string): Promise<TransferRecord> {
    return this.mapOrFail(
      await this.transfers
        .findOne({ _id: id.toLowerCase(), userId })
        .session(ledgerSession())
        .exec(),
    );
  }

  async findByKey(userId: string, key: string): Promise<TransferRecord> {
    return this.mapOrFail(await this.byKey(userId, key.toLowerCase()));
  }

  async findAll(
    userId: string,
    query: FindTransfersDto,
  ): Promise<TransferRecord[]> {
    const rows = await this.transfers
      .find({
        userId,
        $or: [
          { 'intent.source.goalId': query.goalId.toLowerCase() },
          { 'intent.destination.goalId': query.goalId.toLowerCase() },
        ],
        ...(query.status ? { status: query.status } : {}),
      })
      .sort({ acceptedAt: -1, _id: -1 })
      .limit(query.limit)
      .session(ledgerSession())
      .exec();
    return this.attachGoals(
      rows.map((row) => this.map(row)),
      userId,
    );
  }

  private async byKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<TransferDocument | null> {
    return this.transfers
      .findOne({ userId, idempotencyKey })
      .session(ledgerSession())
      .exec();
  }

  private async replay(
    row: TransferDocument,
    intent: NormalizedTransferIntent,
  ): Promise<TransferAcceptance> {
    if (row.intent.fingerprint !== intent.fingerprint)
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message:
          'Esta clave ya corresponde a una transferencia con otros datos.',
      });
    return { record: await this.mapOrFail(row), replayed: true };
  }

  private async mapOrFail(
    row: TransferDocument | null,
  ): Promise<TransferRecord> {
    if (!row)
      throw new NotFoundException(
        'No se encontró la transferencia en tu cuenta.',
      );
    return (await this.attachGoals([this.map(row)], row.userId))[0];
  }

  private async attachGoals(
    records: TransferRecord[],
    userId: string,
  ): Promise<TransferRecord[]> {
    const references = await goalReferences(
      this.goals,
      userId,
      records.flatMap((record) => [
        record.intent.source.goalId,
        record.intent.destination.goalId,
      ]),
    );
    return records.map((record) => ({
      ...record,
      goals: {
        source:
          references.get(record.intent.source.goalId) ??
          unavailableGoal(record.intent.source.goalId),
        destination:
          references.get(record.intent.destination.goalId) ??
          unavailableGoal(record.intent.destination.goalId),
      },
    }));
  }

  private map(row: TransferDocument): TransferRecord {
    return {
      goals: {
        source: unavailableGoal(row.intent.source.goalId),
        destination: unavailableGoal(row.intent.destination.goalId),
      },
      id: row._id,
      userId: row.userId,
      intent: {
        idempotencyKey: row.intent.idempotencyKey,
        kind: row.intent.kind,
        source: {
          goalId: row.intent.source.goalId,
          platform: row.intent.source.platform,
        },
        destination: {
          goalId: row.intent.destination.goalId,
          platform: row.intent.destination.platform,
        },
        unit: row.intent.unit,
        unitScale: row.intent.unitScale,
        quantityUnits: row.intent.quantityUnits,
        feeUnits: row.intent.feeUnits,
        debitUnits: row.intent.debitUnits,
        notes: row.intent.notes,
        fingerprint: row.intent.fingerprint,
      },
      status: row.status,
      acceptedAt: row.acceptedAt.toISOString(),
      effectiveAt: row.effectiveAt.toISOString(),
      sourceEntryId: row.sourceEntryId,
      destinationEntryId: row.destinationEntryId,
      ...(row.commissionEntryId
        ? { commissionEntryId: row.commissionEntryId }
        : {}),
      ...(row.completedAt
        ? { completedAt: row.completedAt.toISOString() }
        : {}),
      ...(row.rejectionCode ? { rejectionCode: row.rejectionCode } : {}),
      ...(row.bookValue
        ? {
            bookValue: {
              delivered: {
                ars: row.bookValue.delivered.ars,
                usd: row.bookValue.delivered.usd,
                hasUnconvertedAmounts:
                  row.bookValue.delivered.hasUnconvertedAmounts,
              },
              commission: {
                ars: row.bookValue.commission.ars,
                usd: row.bookValue.commission.usd,
                hasUnconvertedAmounts:
                  row.bookValue.commission.hasUnconvertedAmounts,
              },
            },
          }
        : {}),
    };
  }
}
