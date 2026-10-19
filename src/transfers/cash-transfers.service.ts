import {
  BadRequestException,
  ConflictException,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { transactionSessionForGoals } from '../common/services/ledger-context';
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
import { TransferExecutionService } from './transfer-execution.service';
import type {
  TransferRecord,
  TransferCurrency,
  TransferBookValue,
} from './transfer.contracts';
import {
  projectCash,
  sliceBookValue,
  zeroPool,
  decimalUnits,
  moneyString,
  type CashProjectionEvent,
  type CashPool,
} from './cash-projection';

@Injectable()
export class CashTransfersService implements OnModuleInit {
  constructor(
    private readonly execution: TransferExecutionService,
    @InjectModel(TransferEntry.name)
    private readonly entries: Model<TransferEntryDocument>,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
    @InjectModel(GoalMovement.name)
    private readonly movements: Model<GoalMovementDocument>,
    @InjectModel(InvestmentOperation.name)
    private readonly operations: Model<InvestmentOperationDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.entries.createIndexes();
  }

  async execute(userId: string, id: string): Promise<TransferRecord> {
    return this.execution.execute(userId, id, 'cash', async (record) => {
      const currency = record.intent.unit;
      if (
        (currency !== 'ARS' && currency !== 'USD') ||
        record.intent.unitScale !== 2
      )
        throw new BadRequestException('Moneda de transferencia inválida.');
      const session = transactionSessionForGoals(userId, [
        record.intent.source.goalId,
        record.intent.destination.goalId,
      ]);
      const effectiveAt = new Date(record.effectiveAt);
      const pool = await this.sourcePool(userId, record, currency);
      const quantity = BigInt(record.intent.quantityUnits) * 1000000n;
      const fee = BigInt(record.intent.feeUnits) * 1000000n;
      const delivered = sliceBookValue(pool, quantity);
      const total = sliceBookValue(pool, quantity + fee);
      const commission: TransferBookValue = {
        ars: moneyString(decimalUnits(total.ars) - decimalUnits(delivered.ars)),
        usd: moneyString(decimalUnits(total.usd) - decimalUnits(delivered.usd)),
        hasUnconvertedAmounts: fee > 0n && pool.hasUnconvertedAmounts,
      };
      const common = { transferId: record.id, userId, currency, effectiveAt };
      await this.entries.insertMany(
        [
          {
            ...common,
            _id: record.sourceEntryId,
            goalId: record.intent.source.goalId,
            platform: record.intent.source.platform,
            kind: 'cash_out',
            amountUnits: record.intent.quantityUnits,
            bookValue: delivered,
          },
          {
            ...common,
            _id: record.destinationEntryId,
            goalId: record.intent.destination.goalId,
            platform: record.intent.destination.platform,
            kind: 'cash_in',
            amountUnits: record.intent.quantityUnits,
            bookValue: delivered,
          },
          ...(fee > 0n
            ? [
                {
                  ...common,
                  _id: record.commissionEntryId,
                  goalId: record.intent.source.goalId,
                  platform: record.intent.source.platform,
                  kind: 'cash_fee',
                  amountUnits: record.intent.feeUnits,
                  bookValue: commission,
                },
              ]
            : []),
        ],
        { session, ordered: true },
      );

      return { delivered, commission };
    });
  }

  private async sourcePool(
    userId: string,
    record: TransferRecord,
    currency: TransferCurrency,
  ): Promise<CashPool> {
    const goalId = record.intent.source.goalId;
    const session = transactionSessionForGoals(userId, [
      goalId,
      record.intent.destination.goalId,
    ]);
    const goal = await this.goals
      .findOne({ _id: goalId, userId })
      .session(session)
      .exec();
    if (!goal)
      throw new ConflictException({
        code: 'GOAL_UNAVAILABLE',
        message: 'Objetivo de origen no disponible.',
      });
    if (new Date(record.effectiveAt) < goal.startDate)
      throw new BadRequestException(
        'La transferencia no puede anteceder al objetivo.',
      );
    const movements = await this.movements
      .find({
        goalId: new Types.ObjectId(goalId),
        userId,
        voided: { $ne: true },
      })
      .session(session)
      .exec();
    const operations = await this.operations
      .find({ goalId: new Types.ObjectId(goalId), userId })
      .session(session)
      .exec();
    const entries = await this.entries
      .find({ goalId, userId })
      .session(session)
      .exec();
    const opening: CashProjectionEvent[] = goal.openingCashBalances.map(
      (item, index) => ({
        id: `opening:${index}`,
        date: goal.startDate,
        priority: 0,
        platform: item.platform,
        currency: item.currency,
        direction: 'in',
        amount: item.amount,
        rate: item.exchangeRateArsPerUsd,
      }),
    );
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
        direction: item.type === 'sell' ? ('in' as const) : ('out' as const),
        amount: item.totalAmount ?? item.netAmount,
        rate: item.exchangeRateArsPerUsd,
      })),
      ...entries.map((item) => ({
        id: item._id,
        date: item.effectiveAt,
        priority: item.kind === 'cash_in' ? 0 : 3,
        platform: item.platform,
        currency: item.currency,
        direction: item.kind === 'cash_in' ? ('in' as const) : ('out' as const),
        amount: 0,
        amountUnits: item.amountUnits,
        bookValue: item.bookValue,
      })),
    ];
    return (
      projectCash(opening, events, new Date(record.effectiveAt)).get(
        `${record.intent.source.platform}:${currency}`,
      ) ?? zeroPool()
    );
  }
}
