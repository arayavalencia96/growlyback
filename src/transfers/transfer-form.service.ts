import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { catalogAssets, storedAsset } from '../assets/asset-catalog';
import { Goal, type GoalDocument } from '../goals/entity/goals.entity';
import {
  GoalMovement,
  type GoalMovementDocument,
} from '../goals-movements/entity/goals-movements.entity';
import {
  InvestmentOperation,
  type InvestmentOperationDocument,
} from '../investment-operations/entity/investment-operations.entity';
import {
  TransferEntry,
  type TransferEntryDocument,
} from './entity/transfer-entry.entity';
import {
  CryptoTransferEntry,
  type CryptoTransferEntryDocument,
} from './entity/crypto-transfer-entry.entity';
import {
  projectCash,
  moneyUnits,
  type CashProjectionEvent,
} from './cash-projection';
import { normalizeTransferIntent } from './transfer.rules';
import { catalogAsset } from '../assets/asset-catalog';
import type { TransferIntent } from './transfer.contracts';

interface TransferContextSnapshot extends Goal {
  _id: Types.ObjectId;
  destinations: Array<{ _id: Types.ObjectId; name: string }>;
  movements: Array<GoalMovement & { _id: Types.ObjectId }>;
  operations: Array<InvestmentOperation & { _id: Types.ObjectId }>;
  cash: TransferEntry[];
  crypto: CryptoTransferEntry[];
}

export interface TransferSourceOption {
  key: string;
  kind: 'cash' | 'crypto';
  platform: string;
  unit: string;
  label: string;
  scale: number;
  availableUnits: string;
}
export interface TransferFormContext {
  goals: { id: string; name: string }[];
  sources: TransferSourceOption[];
  platforms: string[];
  warnings: string[];
  consultedAt: string;
}

@Injectable()
export class TransferFormService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
    @InjectModel(GoalMovement.name)
    private readonly movements: Model<GoalMovementDocument>,
    @InjectModel(InvestmentOperation.name)
    private readonly operations: Model<InvestmentOperationDocument>,
    @InjectModel(TransferEntry.name)
    private readonly cashEntries: Model<TransferEntryDocument>,
    @InjectModel(CryptoTransferEntry.name)
    private readonly cryptoEntries: Model<CryptoTransferEntryDocument>,
  ) {}

  async context(goalId: string, userId: string): Promise<TransferFormContext> {
    goalId = goalId.toLowerCase();
    return this.connection.transaction(
      async (session) => {
        const [goal] = await this.goals
          .aggregate<TransferContextSnapshot>([
            {
              $match: {
                _id: new Types.ObjectId(goalId),
                userId,
                deletedAt: null,
              },
            },
            {
              $set: {
                referenceId: { $toString: '$_id' },
                openingCashBalances: { $ifNull: ['$openingCashBalances', []] },
                openingPositions: { $ifNull: ['$openingPositions', []] },
              },
            },
            {
              $lookup: {
                from: this.movements.collection.name,
                localField: '_id',
                foreignField: 'goalId',
                pipeline: [{ $match: { userId, voided: { $ne: true } } }],
                as: 'movements',
              },
            },
            {
              $lookup: {
                from: this.operations.collection.name,
                localField: '_id',
                foreignField: 'goalId',
                pipeline: [{ $match: { userId } }],
                as: 'operations',
              },
            },
            {
              $lookup: {
                from: this.cashEntries.collection.name,
                localField: 'referenceId',
                foreignField: 'goalId',
                pipeline: [{ $match: { userId } }],
                as: 'cash',
              },
            },
            {
              $lookup: {
                from: this.cryptoEntries.collection.name,
                localField: 'referenceId',
                foreignField: 'goalId',
                pipeline: [{ $match: { userId } }],
                as: 'crypto',
              },
            },
            {
              $lookup: {
                from: this.goals.collection.name,
                pipeline: [
                  {
                    $match: {
                      userId,
                      deletedAt: null,
                      status: 'active',
                      startDate: { $lte: new Date() },
                      cashyAdjustmentLock: { $in: [null, ''] },
                    },
                  },
                  { $project: { _id: 1, name: 1 } },
                ],
                as: 'destinations',
              },
            },
            { $unset: 'referenceId' },
          ])
          .session(session)
          .exec();
        if (!goal)
          throw new NotFoundException('Objetivo no disponible en tu cuenta.');
        const {
          movements,
          operations,
          cash,
          crypto,
          destinations: goals,
        } = goal;
        const now = new Date();
        const warnings: string[] = [];
        const sources: TransferSourceOption[] = [];
        const platforms = [
          ...new Set(
            [
              ...goal.openingCashBalances,
              ...goal.openingPositions,
              ...movements,
              ...operations,
              ...cash,
              ...crypto,
            ].map((row) => row.platform?.trim().toUpperCase() || 'GENERAL'),
          ),
        ].sort();
        const events: CashProjectionEvent[] = [
          ...movements.map((item) => ({
            id: item._id.toString(),
            date: item.movementDate,
            priority: item.type === 'contribution' ? 0 : 3,
            platform: item.platform || 'GENERAL',
            currency: item.currency,
            direction:
              item.type === 'contribution' ? ('in' as const) : ('out' as const),
            amount: item.amount,
            rate: item.exchangeRateArsPerUsd,
          })),
          ...operations.map((item) => ({
            id: item._id.toString(),
            date: item.operationDate,
            priority: item.type === 'buy' ? 1 : 2,
            platform: item.platform,
            currency: item.currency,
            direction:
              item.type === 'sell' ? ('in' as const) : ('out' as const),
            amount: item.totalAmount ?? item.netAmount,
            rate: item.exchangeRateArsPerUsd,
          })),
          ...cash.map((item) => ({
            id: item._id,
            date: item.effectiveAt,
            priority: item.kind === 'cash_in' ? 0 : 3,
            platform: item.platform,
            currency: item.currency,
            direction:
              item.kind === 'cash_in' ? ('in' as const) : ('out' as const),
            amount: 0,
            amountUnits: item.amountUnits,
            bookValue: item.bookValue,
          })),
        ];
        try {
          const pools = projectCash(
            goal.openingCashBalances.map((item, index) => ({
              id: `opening:${index}`,
              date: goal.startDate,
              priority: 0,
              platform: item.platform,
              currency: item.currency,
              direction: 'in',
              amount: item.amount,
              rate: item.exchangeRateArsPerUsd,
            })),
            events,
            now,
          );
          for (const platform of platforms)
            for (const currency of ['ARS', 'USD'] as const) {
              const available =
                (pools.get(`${platform}:${currency}`)?.amount ?? 0n) / 1000000n;
              if (available > 0n)
                sources.push({
                  key: `cash:${platform}:${currency}`,
                  kind: 'cash',
                  platform,
                  unit: currency,
                  label: currency,
                  scale: 2,
                  availableUnits: available.toString(),
                });
            }
        } catch {
          warnings.push(
            'La caja requiere revisar su historial antes de transferir dinero. No se inventó saldo disponible.',
          );
        }
        for (const asset of catalogAssets().filter(
          (item) => item.transferable && item.classification === 'crypto',
        ))
          for (const platform of platforms) {
            const initial = goal.openingPositions.filter(
              (row) => row.platform === platform && row.ticker === asset.ticker,
            );
            const trades = operations.filter(
              (row) =>
                row.platform === platform &&
                row.ticker === asset.ticker &&
                row.operationDate <= now,
            );
            if (
              [...initial, ...trades].some(
                (row) =>
                  storedAsset(row.ticker, row.assetId)?.assetId !==
                  asset.assetId,
              )
            ) {
              warnings.push(
                `${platform} · ${asset.ticker}: identificá sus registros antes de transferir.`,
              );
              continue;
            }
            let quantity = initial.reduce(
              (sum, row) => sum + moneyUnits(row.quantity),
              0n,
            );
            for (const row of trades)
              quantity +=
                (row.type === 'buy' ? 1n : -1n) * moneyUnits(row.quantity);
            for (const row of crypto.filter(
              (item) =>
                item.platform === platform &&
                item.assetId === asset.assetId &&
                item.effectiveAt <= now,
            ))
              quantity +=
                (row.kind === 'asset_in' ? 1n : -1n) *
                BigInt(row.quantityUnits) *
                10n ** BigInt(8 - row.quantityScale);
            const available = quantity / 10n ** BigInt(8 - asset.quantityScale);
            if (available > 0n)
              sources.push({
                key: `crypto:${platform}:${asset.assetId}`,
                kind: 'crypto',
                platform,
                unit: asset.assetId,
                label: asset.ticker,
                scale: asset.quantityScale,
                availableUnits: available.toString(),
              });
          }
        if (
          goal.status !== 'active' ||
          goal.cashyAdjustmentLock ||
          goal.startDate > now
        ) {
          sources.length = 0;
          warnings.push(
            'El objetivo de origen debe estar activo, disponible y haber comenzado.',
          );
        }
        return {
          goals: goals.map((row) => ({
            id: row._id.toString(),
            name: row.name,
          })),
          platforms,
          sources,
          warnings,
          consultedAt: now.toISOString(),
        };
      },
      { readConcern: { level: 'snapshot' } },
    );
  }

  async preview(input: TransferIntent, userId: string) {
    const intent = normalizeTransferIntent(
      input,
      input.kind === 'crypto' ? catalogAsset(input.assetId) : undefined,
    );
    const context = await this.context(intent.source.goalId, userId);
    if (!context.goals.some((goal) => goal.id === intent.destination.goalId))
      throw new BadRequestException(
        'El objetivo de destino no está disponible en tu cuenta.',
      );
    const source = context.sources.find(
      (item) =>
        item.platform === intent.source.platform &&
        item.unit === intent.unit &&
        item.kind === intent.kind,
    );
    if (!source)
      throw new BadRequestException(
        'No hay saldo o posición identificada en ese origen.',
      );
    if (BigInt(intent.debitUnits) > BigInt(source.availableUnits))
      throw new BadRequestException(
        'La cantidad y la comisión exceden el disponible.',
      );
    return {
      availableUnits: source.availableUnits,
      debitUnits: intent.debitUnits,
      remainingUnits: (
        BigInt(source.availableUnits) - BigInt(intent.debitUnits)
      ).toString(),
      unitScale: intent.unitScale,
      consultedAt: context.consultedAt,
      registered: false as const,
    };
  }
}
