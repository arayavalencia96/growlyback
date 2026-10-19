import {
  BadRequestException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { catalogAsset, storedAsset } from '../assets/asset-catalog';
import { transactionSessionForGoals } from '../common/services/ledger-context';
import { Goal, type GoalDocument } from '../goals/entity/goals.entity';
import {
  InvestmentOperation,
  type InvestmentOperationDocument,
} from '../investment-operations/entity/investment-operations.entity';
import {
  CryptoTransferEntry,
  type CryptoTransferEntryDocument,
} from './entity/crypto-transfer-entry.entity';
import { TransferExecutionService } from './transfer-execution.service';
import {
  decimalUnits,
  moneyString,
  moneyUnits,
  sliceBookValue,
  type CashPool,
} from './cash-projection';
import {
  projectPositions,
  type PositionProjectionEvent,
} from './position-projection';
import type { TransferBookValue, TransferRecord } from './transfer.contracts';

@Injectable()
export class CryptoTransfersService implements OnModuleInit {
  constructor(
    private readonly execution: TransferExecutionService,
    @InjectModel(CryptoTransferEntry.name)
    private readonly entries: Model<CryptoTransferEntryDocument>,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
    @InjectModel(InvestmentOperation.name)
    private readonly operations: Model<InvestmentOperationDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.entries.createIndexes();
  }

  async execute(userId: string, id: string): Promise<TransferRecord> {
    return this.execution.execute(userId, id, 'crypto', async (record) => {
      const asset = catalogAsset(record.intent.unit);
      if (
        !asset?.transferable ||
        asset.classification !== 'crypto' ||
        asset.quantityScale !== record.intent.unitScale
      )
        throw new BadRequestException({
          code: 'ASSET_NOT_TRANSFERABLE',
          message:
            'El activo no está habilitado como criptomoneda transferible.',
        });
      const session = transactionSessionForGoals(userId, [
        record.intent.source.goalId,
        record.intent.destination.goalId,
      ]);
      const source = await this.positionPool(
        userId,
        record,
        record.intent.source.goalId,
        record.intent.source.platform,
      );
      await this.positionPool(
        userId,
        record,
        record.intent.destination.goalId,
        record.intent.destination.platform,
        false,
      );
      if (!source || source.amount === 0n)
        throw new BadRequestException({
          code: 'SOURCE_POSITION_MISSING',
          message:
            'No tenés este activo en el objetivo y plataforma de origen.',
        });
      const factor = 10n ** BigInt(8 - asset.quantityScale);
      const quantity = BigInt(record.intent.quantityUnits) * factor;
      const fee = BigInt(record.intent.feeUnits) * factor;
      const delivered = sliceBookValue(source, quantity);
      const total = sliceBookValue(source, quantity + fee);
      const commission: TransferBookValue = {
        ars: moneyString(decimalUnits(total.ars) - decimalUnits(delivered.ars)),
        usd: moneyString(decimalUnits(total.usd) - decimalUnits(delivered.usd)),
        hasUnconvertedAmounts: fee > 0n && source.hasUnconvertedAmounts,
      };
      const common = {
        transferId: record.id,
        userId,
        assetId: asset.assetId,
        ticker: asset.ticker,
        quantityScale: asset.quantityScale,
        effectiveAt: new Date(record.effectiveAt),
      };
      await this.entries.insertMany(
        [
          {
            ...common,
            _id: record.sourceEntryId,
            goalId: record.intent.source.goalId,
            platform: record.intent.source.platform,
            kind: 'asset_out',
            quantityUnits: record.intent.quantityUnits,
            bookValue: delivered,
          },
          {
            ...common,
            _id: record.destinationEntryId,
            goalId: record.intent.destination.goalId,
            platform: record.intent.destination.platform,
            kind: 'asset_in',
            quantityUnits: record.intent.quantityUnits,
            bookValue: delivered,
          },
          ...(fee > 0n
            ? [
                {
                  ...common,
                  _id: record.commissionEntryId,
                  goalId: record.intent.source.goalId,
                  platform: record.intent.source.platform,
                  kind: 'asset_fee',
                  quantityUnits: record.intent.feeUnits,
                  bookValue: commission,
                },
              ]
            : []),
        ],
        { session, ordered: true },
      );
      for (const endpoint of [record.intent.source, record.intent.destination])
        await this.positionPool(
          userId,
          record,
          endpoint.goalId,
          endpoint.platform,
          false,
          new Date(),
        );
      return { delivered, commission };
    });
  }

  private async positionPool(
    userId: string,
    record: TransferRecord,
    goalId: string,
    platform: string,
    required = true,
    until = new Date(record.effectiveAt),
  ): Promise<CashPool | undefined> {
    const asset = catalogAsset(record.intent.unit);
    if (!asset)
      throw new BadRequestException({
        code: 'ASSET_NOT_TRANSFERABLE',
        message: 'Activo desconocido.',
      });
    const session = transactionSessionForGoals(userId, [goalId]);
    const goal = await this.goals
      .findOne({ _id: goalId, userId })
      .session(session)
      .exec();
    if (!goal || new Date(record.effectiveAt) < goal.startDate)
      throw new BadRequestException({
        code: 'GOAL_UNAVAILABLE',
        message:
          'La transferencia no corresponde a un objetivo disponible en esa fecha.',
      });
    const operations = await this.operations
      .find({
        goalId: new Types.ObjectId(goalId),
        userId,
        platform,
        ticker: asset.ticker,
      })
      .session(session)
      .exec();
    const opening = goal.openingPositions.filter(
      (item) => item.platform === platform && item.ticker === asset.ticker,
    );
    if (
      [...opening, ...operations].some(
        (item) =>
          storedAsset(item.ticker, item.assetId)?.assetId !== asset.assetId,
      )
    )
      throw new BadRequestException({
        code: 'ASSET_NOT_TRANSFERABLE',
        message:
          'Hay posiciones sin identificar o incompatibles. Revisá su migración antes de transferir.',
      });
    const entries = await this.entries
      .find({ goalId, userId, platform, assetId: asset.assetId })
      .session(session)
      .exec();
    if (
      entries.some(
        (item) =>
          item.ticker !== asset.ticker ||
          item.quantityScale !== asset.quantityScale,
      )
    )
      throw new BadRequestException({
        code: 'ASSET_NOT_TRANSFERABLE',
        message: 'El historial de transferencias no coincide con el catálogo.',
      });
    const events: PositionProjectionEvent[] = [
      ...operations.map((item) => ({
        id: item._id.toString(),
        date: item.operationDate,
        priority: item.type === 'buy' ? 1 : 2,
        platform,
        ticker: asset.ticker,
        direction: item.type === 'buy' ? ('in' as const) : ('out' as const),
        quantity: moneyUnits(item.quantity),
        amount: item.totalAmount ?? item.netAmount,
        currency: item.currency,
        rate: item.exchangeRateArsPerUsd,
      })),
      ...entries.map((item) => ({
        id: item._id,
        date: item.effectiveAt,
        priority: item.kind === 'asset_in' ? 0 : 3,
        platform,
        ticker: asset.ticker,
        direction:
          item.kind === 'asset_in' ? ('in' as const) : ('out' as const),
        quantity:
          BigInt(item.quantityUnits) * 10n ** BigInt(8 - item.quantityScale),
        bookValue: item.bookValue,
      })),
    ];
    const pool = projectPositions(
      opening.map((item, index) => ({
        id: `opening:${index}`,
        date: goal.startDate,
        priority: 0,
        platform,
        ticker: asset.ticker,
        direction: 'in',
        quantity: moneyUnits(item.quantity),
        amount: item.totalAmount,
        currency: item.currency,
        rate: item.exchangeRateArsPerUsd,
      })),
      events,
      until,
    ).get(`${platform}:${asset.ticker}`);
    if (required && !pool)
      throw new BadRequestException({
        code: 'SOURCE_POSITION_MISSING',
        message: 'No existe una posición en ese objetivo y plataforma.',
      });
    return pool;
  }
}
