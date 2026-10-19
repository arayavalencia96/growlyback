import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  ledgerReadContext,
  ledgerSession,
} from '../common/services/ledger-context';
import {
  TransferEntry,
  type TransferEntryDocument,
} from '../transfers/entity/transfer-entry.entity';
import {
  CryptoTransferEntry,
  type CryptoTransferEntryDocument,
} from '../transfers/entity/crypto-transfer-entry.entity';
import {
  projectCash,
  moneyUnits,
  sliceBookValue,
  type CashPool,
  type CashProjectionEvent,
} from '../transfers/cash-projection';
import {
  projectPositions,
  type PositionProjectionEvent,
} from '../transfers/position-projection';
import { GoalsMovementsService } from '../goals-movements/goals-movements.service';
import { GoalMovementDocument } from '../goals-movements/entity/goals-movements.entity';
import { GoalsService } from '../goals/goals.service';
import { InvestmentOperationDocument } from '../investment-operations/entity/investment-operations.entity';
import { InvestmentOperationsService } from '../investment-operations/investment-operations.service';
import {
  ICashBalanceSummary,
  IGoalSummaryResponse,
  IMoneyTotals,
  IOpenPositionSummary,
  IPlatformBookValue,
  IPortfolioSummaryResponse,
  IRealizedProfitDetail,
} from './interfaces/summaries.interface';

@Injectable()
export class SummariesService {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly goalsMovementsService: GoalsMovementsService,
    private readonly investmentOperationsService: InvestmentOperationsService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(TransferEntry.name)
    private readonly cashEntries: Model<TransferEntryDocument>,
    @InjectModel(CryptoTransferEntry.name)
    private readonly cryptoEntries: Model<CryptoTransferEntryDocument>,
  ) {}

  async getPortfolioSummary(
    userId: string,
  ): Promise<IPortfolioSummaryResponse> {
    if (!ledgerSession())
      return this.snapshot(() => this.getPortfolioSummary(userId));
    const goals = await this.goalsService.findAll({}, userId);
    const summaries: IGoalSummaryResponse[] = [];
    for (const goal of goals)
      summaries.push(await this.getGoalSummary(goal.id, userId));
    const platforms = new Map<string, IMoneyTotals>();

    for (const summary of summaries) {
      for (const item of summary.platformBookValues) {
        platforms.set(
          item.platform,
          this.add(platforms.get(item.platform) ?? this.zero(), item.value),
        );
      }
    }

    const platformBookValues = [...platforms.entries()]
      .map(([platform, value]) => ({ platform, value }))
      .filter(({ value }) =>
        [value.ars, value.usd].some((amount) => amount !== 0),
      )
      .sort((a, b) => b.value.usd - a.value.usd || b.value.ars - a.value.ars);

    return {
      totalBookValue: platformBookValues.reduce(
        (total, item) => this.add(total, item.value),
        this.zero(),
      ),
      platformBookValues,
      goalsCount: goals.length,
      hasUnconvertedAmounts: summaries.some(
        ({ hasUnconvertedAmounts }) => hasUnconvertedAmounts,
      ),
    };
  }

  async getGoalSummary(
    goalId: string,
    userId: string,
  ): Promise<IGoalSummaryResponse> {
    if (!ledgerSession())
      return this.snapshot(() => this.getGoalSummary(goalId, userId));
    const goal = await this.goalsService.findOneOwned(goalId, userId);
    const movements = await this.goalsMovementsService.findByGoal(
      goalId,
      userId,
    );
    const operations = await this.investmentOperationsService.findByGoal(
      goalId,
      userId,
    );
    const cashEntries = await this.cashEntries
      .find({ goalId, userId })
      .session(ledgerSession())
      .exec();
    const cryptoEntries = await this.cryptoEntries
      .find({ goalId, userId })
      .session(ledgerSession())
      .exec();
    const state = { hasUnconvertedAmounts: false };
    const openingCash = goal.openingCashBalances.reduce(
      (total, balance) =>
        this.add(
          total,
          this.convert(
            balance.amount,
            balance.currency,
            balance.exchangeRateArsPerUsd,
            state,
          ),
        ),
      this.zero(),
    );
    const contributions = this.sumMovements(movements, 'contribution', state);
    const withdrawals = this.sumMovements(movements, 'withdrawal', state);
    const investment = this.calculateInvestments(
      operations,
      goal.openingPositions,
      cryptoEntries,
      state,
    );
    const netContributions = this.subtract(contributions, withdrawals);
    let cashBalance = this.add(
      this.subtract(
        this.add(openingCash, netContributions),
        investment.totalBuyCost,
      ),
      investment.totalSellProceeds,
    );
    let cashBalances = this.calculateCashBalances(
      goal.openingCashBalances,
      movements,
      operations,
    );
    let platformBookValues = this.calculatePlatformBookValues(
      goal.openingCashBalances,
      movements,
      operations,
      investment.openPositions,
      state,
    );
    try {
      const opening: CashProjectionEvent[] = goal.openingCashBalances.map(
        (item, index) => ({
          id: 'opening:' + index,
          date: new Date(goal.startDate),
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
        ...cashEntries.map((item) => ({
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
      const pools = projectCash(opening, events, new Date(8640000000000000));
      cashBalance = this.zero();
      cashBalances = [];
      const platforms = new Map<string, IMoneyTotals>();
      for (const [key, pool] of pools) {
        const separator = key.lastIndexOf(':');
        const platform = key.slice(0, separator);
        const currency = key.slice(separator + 1) as 'ARS' | 'USD';
        const value = this.poolValue(pool);
        cashBalance = this.add(cashBalance, value);
        platforms.set(
          platform,
          this.add(platforms.get(platform) ?? this.zero(), value),
        );
        if (pool.amount > 0n)
          cashBalances.push({
            platform,
            currency,
            amount: Number(pool.amount) / 1e8,
          });
        state.hasUnconvertedAmounts ||= pool.hasUnconvertedAmounts;
      }
      for (const position of investment.openPositions)
        platforms.set(
          position.platform,
          this.add(
            platforms.get(position.platform) ?? this.zero(),
            position.invested,
          ),
        );
      platformBookValues = [...platforms]
        .map(([platform, value]) => ({ platform, value }))
        .filter(({ value }) => value.ars !== 0 || value.usd !== 0)
        .sort((a, b) => b.value.usd - a.value.usd || b.value.ars - a.value.ars);
    } catch (error: unknown) {
      if (cashEntries.length || !(error instanceof BadRequestException))
        throw error;
      const response = error.getResponse();
      if (
        typeof response === 'string' ||
        !('code' in response) ||
        response.code !== 'INSUFFICIENT_BALANCE'
      )
        throw error;
    }
    const transferIn = this.zero(),
      transferOut = this.zero(),
      transferFees = this.zero();
    for (const entry of [...cashEntries, ...cryptoEntries]) {
      const total = entry.kind.endsWith('_in')
        ? transferIn
        : entry.kind.endsWith('_fee')
          ? transferFees
          : transferOut;
      total.ars = this.round(total.ars + Number(entry.bookValue.ars));
      total.usd = this.round(total.usd + Number(entry.bookValue.usd));
      state.hasUnconvertedAmounts ||= entry.bookValue.hasUnconvertedAmounts;
    }
    const transfersCount = new Set(
      [...cashEntries, ...cryptoEntries].map((item) => item.transferId),
    ).size;
    const portfolioBookValue = this.add(
      cashBalance,
      investment.openPositionValueAtCost,
    );
    const valueInGoalCurrency =
      goal.currency === 'ARS' ? portfolioBookValue.ars : portfolioBookValue.usd;

    return {
      goalId,
      userId: goal.userId,
      goalName: goal.name,
      goalCurrency: goal.currency,
      targetAmount: goal.targetAmount,
      contributions,
      withdrawals,
      netContributions,
      transferIn,
      transferOut,
      transferFees,
      transfersCount,
      totalBuyCost: investment.totalBuyCost,
      totalSellProceeds: investment.totalSellProceeds,
      realizedProfit: investment.realizedProfit,
      realizedProfitDetails: investment.realizedProfitDetails,
      cashBalance,
      cashBalances,
      platformBookValues,
      openPositionValueAtCost: investment.openPositionValueAtCost,
      portfolioBookValue,
      progressPercentage: this.round(
        (valueInGoalCurrency / goal.targetAmount) * 100,
      ),
      openPositionsCount: investment.openPositions.length,
      operationsCount: operations.length,
      hasUnconvertedAmounts: state.hasUnconvertedAmounts,
      openPositions: investment.openPositions,
    };
  }

  private calculatePlatformBookValues(
    openingBalances: Array<{
      platform: string;
      currency: 'ARS' | 'USD';
      amount: number;
      exchangeRateArsPerUsd?: number | null;
    }>,
    movements: GoalMovementDocument[],
    operations: InvestmentOperationDocument[],
    openPositions: IOpenPositionSummary[],
    state: { hasUnconvertedAmounts: boolean },
  ): IPlatformBookValue[] {
    const values = new Map<string, IMoneyTotals>();
    const apply = (
      platform: string | null | undefined,
      value: IMoneyTotals,
    ) => {
      const normalizedPlatform = platform?.trim().toUpperCase() || 'GENERAL';
      values.set(
        normalizedPlatform,
        this.add(values.get(normalizedPlatform) ?? this.zero(), value),
      );
    };

    for (const balance of openingBalances)
      apply(
        balance.platform,
        this.convert(
          balance.amount,
          balance.currency,
          balance.exchangeRateArsPerUsd,
          state,
        ),
      );
    for (const movement of movements) {
      const converted = this.convert(
        movement.amount,
        movement.currency,
        movement.exchangeRateArsPerUsd,
        state,
      );
      apply(
        movement.platform,
        movement.type === 'contribution'
          ? converted
          : { ars: -converted.ars, usd: -converted.usd },
      );
    }
    for (const operation of operations) {
      const converted = this.convert(
        operation.totalAmount ?? operation.netAmount,
        operation.currency,
        operation.exchangeRateArsPerUsd,
        state,
      );
      apply(
        operation.platform,
        operation.type === 'buy'
          ? { ars: -converted.ars, usd: -converted.usd }
          : converted,
      );
    }
    for (const position of openPositions)
      apply(position.platform, position.invested);

    return [...values.entries()]
      .map(([platform, value]) => ({ platform, value }))
      .filter(({ value }) =>
        [value.ars, value.usd].some((amount) => amount !== 0),
      )
      .sort((a, b) => b.value.usd - a.value.usd || b.value.ars - a.value.ars);
  }

  private calculateCashBalances(
    openingBalances: Array<{
      platform: string;
      currency: 'ARS' | 'USD';
      amount: number;
    }>,
    movements: GoalMovementDocument[],
    operations: InvestmentOperationDocument[],
  ): ICashBalanceSummary[] {
    const balances = new Map<string, ICashBalanceSummary>();
    const apply = (
      platform: string | null | undefined,
      currency: 'ARS' | 'USD',
      amount: number,
    ) => {
      const normalizedPlatform = platform?.trim().toUpperCase() || 'GENERAL';
      const key = `${normalizedPlatform}:${currency}`;
      const current = balances.get(key)?.amount ?? 0;
      balances.set(key, {
        platform: normalizedPlatform,
        currency,
        amount: this.round(current + amount),
      });
    };

    for (const balance of openingBalances)
      apply(balance.platform, balance.currency, balance.amount);
    for (const movement of movements)
      apply(
        movement.platform,
        movement.currency,
        movement.type === 'contribution' ? movement.amount : -movement.amount,
      );
    for (const operation of operations)
      apply(
        operation.platform,
        operation.currency,
        operation.type === 'buy'
          ? -(operation.totalAmount ?? operation.netAmount)
          : (operation.totalAmount ?? operation.netAmount),
      );

    return [...balances.values()]
      .filter(({ amount }) => amount !== 0)
      .sort(
        (a, b) =>
          a.platform.localeCompare(b.platform) ||
          a.currency.localeCompare(b.currency),
      );
  }

  private sumMovements(
    movements: GoalMovementDocument[],
    type: 'contribution' | 'withdrawal',
    state: { hasUnconvertedAmounts: boolean },
  ): IMoneyTotals {
    return movements
      .filter((movement) => movement.type === type)
      .reduce(
        (total, movement) =>
          this.add(
            total,
            this.convert(
              movement.amount,
              movement.currency,
              movement.exchangeRateArsPerUsd,
              state,
            ),
          ),
        this.zero(),
      );
  }

  private calculateInvestments(
    operations: InvestmentOperationDocument[],
    openingPositions: Array<{
      platform: string;
      ticker: string;
      quantity: number;
      totalAmount: number;
      currency: 'ARS' | 'USD';
      exchangeRateArsPerUsd?: number | null;
    }>,
    entries: CryptoTransferEntryDocument[],
    state: { hasUnconvertedAmounts: boolean },
  ) {
    const until = new Date(8640000000000000);
    const opening: PositionProjectionEvent[] = openingPositions.map(
      (item, index) => ({
        id: 'opening:' + index,
        date: new Date(0),
        priority: 0,
        platform: item.platform,
        ticker: item.ticker,
        direction: 'in',
        quantity: moneyUnits(item.quantity),
        amount: item.totalAmount,
        currency: item.currency,
        rate: item.exchangeRateArsPerUsd,
      }),
    );
    const pools = projectPositions(opening, [], until);
    const events: PositionProjectionEvent[] = [
      ...operations.map((item) => ({
        id: item._id.toString(),
        date: item.operationDate,
        priority: item.type === 'buy' ? 1 : 2,
        platform: item.platform,
        ticker: item.ticker,
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
        platform: item.platform,
        ticker: item.ticker,
        direction:
          item.kind === 'asset_in' ? ('in' as const) : ('out' as const),
        quantity:
          BigInt(item.quantityUnits) * 10n ** BigInt(8 - item.quantityScale),
        bookValue: item.bookValue,
      })),
    ].sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.priority - b.priority ||
        a.id.localeCompare(b.id),
    );
    const byId = new Map(operations.map((item) => [item._id.toString(), item]));
    let totalBuyCost = this.zero(),
      totalSellProceeds = this.zero(),
      realizedProfit = this.zero();
    const realizedProfitDetails: IRealizedProfitDetail[] = [];
    for (const event of events) {
      const operation = byId.get(event.id);
      if (operation) {
        const proceeds = this.convert(
          operation.totalAmount ?? operation.netAmount,
          operation.currency,
          operation.exchangeRateArsPerUsd,
          state,
        );
        if (operation.type === 'buy')
          totalBuyCost = this.add(totalBuyCost, proceeds);
        else {
          const pool = pools.get(operation.platform + ':' + operation.ticker);
          if (!pool) throw new Error('Venta sin posición contable.');
          const book = sliceBookValue(pool, event.quantity);
          state.hasUnconvertedAmounts ||= book.hasUnconvertedAmounts;
          const costBasis = { ars: Number(book.ars), usd: Number(book.usd) };
          const profitOrLoss = this.subtract(proceeds, costBasis);
          totalSellProceeds = this.add(totalSellProceeds, proceeds);
          realizedProfit = this.add(realizedProfit, profitOrLoss);
          realizedProfitDetails.push({
            operationId: operation._id.toString(),
            platform: operation.platform,
            ticker: operation.ticker,
            quantity: operation.quantity,
            operationDate: operation.operationDate,
            costBasis,
            proceeds,
            profitOrLoss,
          });
        }
      }
      projectPositions([], [event], until, pools);
    }
    const openPositions: IOpenPositionSummary[] = [];
    let openPositionValueAtCost = this.zero();
    for (const [key, pool] of pools) {
      if (pool.amount === 0n) continue;
      state.hasUnconvertedAmounts ||= pool.hasUnconvertedAmounts;
      const quantity = Number(pool.amount) / 1e8,
        invested = this.poolValue(pool);
      const separator = key.indexOf(':');
      openPositions.push({
        hasUnconvertedAmounts: pool.hasUnconvertedAmounts,
        platform: key.slice(0, separator),
        ticker: key.slice(separator + 1),
        quantity,
        invested,
        averageCost: {
          ars: this.round(invested.ars / quantity),
          usd: this.round(invested.usd / quantity),
        },
      });
      openPositionValueAtCost = this.add(openPositionValueAtCost, invested);
    }
    return {
      totalBuyCost,
      totalSellProceeds,
      realizedProfit,
      realizedProfitDetails,
      openPositionValueAtCost,
      openPositions,
    };
  }

  private poolValue(pool: CashPool): IMoneyTotals {
    return { ars: Number(pool.ars) / 1e8, usd: Number(pool.usd) / 1e8 };
  }

  private async snapshot<T>(work: () => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(
        () => ledgerReadContext.run(session, work),
        {
          readConcern: { level: 'snapshot' },
          readPreference: 'primary',
        },
      );
    } finally {
      await session.endSession();
    }
  }

  private convert(
    amount: number,
    currency: 'ARS' | 'USD',
    rate: number | null | undefined,
    state: { hasUnconvertedAmounts: boolean },
  ): IMoneyTotals {
    if (!rate) state.hasUnconvertedAmounts = true;
    return currency === 'ARS'
      ? { ars: this.round(amount), usd: rate ? this.round(amount / rate) : 0 }
      : { ars: rate ? this.round(amount * rate) : 0, usd: this.round(amount) };
  }

  private zero(): IMoneyTotals {
    return { ars: 0, usd: 0 };
  }
  private add(a: IMoneyTotals, b: IMoneyTotals): IMoneyTotals {
    return { ars: this.round(a.ars + b.ars), usd: this.round(a.usd + b.usd) };
  }
  private subtract(a: IMoneyTotals, b: IMoneyTotals): IMoneyTotals {
    return { ars: this.round(a.ars - b.ars), usd: this.round(a.usd - b.usd) };
  }
  private round(value: number): number {
    return Number(value.toFixed(8));
  }
}
