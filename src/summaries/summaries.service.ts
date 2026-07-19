import { Injectable } from '@nestjs/common';
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
} from './interfaces/summaries.interface';

interface ILot {
  quantity: number;
  unitCost: IMoneyTotals;
}

@Injectable()
export class SummariesService {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly goalsMovementsService: GoalsMovementsService,
    private readonly investmentOperationsService: InvestmentOperationsService,
  ) {}

  async getPortfolioSummary(
    userId: string,
  ): Promise<IPortfolioSummaryResponse> {
    const goals = await this.goalsService.findAll({}, userId);
    const summaries = await Promise.all(
      goals.map((goal) => this.getGoalSummary(goal.id, userId)),
    );
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
        [value.ars, value.usd].some((amount) => Math.abs(amount) > 0.00000001),
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
    const [goal, movements, operations] = await Promise.all([
      this.goalsService.findOneOwned(goalId, userId),
      this.goalsMovementsService.findByGoal(goalId, userId),
      this.investmentOperationsService.findByGoal(goalId, userId),
    ]);
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
      state,
    );
    const netContributions = this.subtract(contributions, withdrawals);
    const cashBalance = this.add(
      this.subtract(
        this.add(openingCash, netContributions),
        investment.totalBuyCost,
      ),
      investment.totalSellProceeds,
    );
    const cashBalances = this.calculateCashBalances(
      goal.openingCashBalances,
      movements,
      operations,
    );
    const platformBookValues = this.calculatePlatformBookValues(
      goal.openingCashBalances,
      movements,
      operations,
      investment.openPositions,
      state,
    );
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
      totalBuyCost: investment.totalBuyCost,
      totalSellProceeds: investment.totalSellProceeds,
      realizedProfit: investment.realizedProfit,
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
        [value.ars, value.usd].some((amount) => Math.abs(amount) > 0.00000001),
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
      .filter(({ amount }) => Math.abs(amount) > 0.00000001)
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
    state: { hasUnconvertedAmounts: boolean },
  ) {
    const lots = new Map<string, ILot[]>();
    let totalBuyCost = this.zero();
    let totalSellProceeds = this.zero();
    let realizedProfit = this.zero();

    for (const position of openingPositions) {
      const amount = this.convert(
        position.totalAmount,
        position.currency,
        position.exchangeRateArsPerUsd,
        state,
      );
      lots.set(`${position.platform}:${position.ticker}`, [
        {
          quantity: position.quantity,
          unitCost: {
            ars: this.round(amount.ars / position.quantity),
            usd: this.round(amount.usd / position.quantity),
          },
        },
      ]);
    }

    for (const operation of operations) {
      const key = `${operation.platform}:${operation.ticker}`;
      const amount = this.convert(
        operation.totalAmount ?? operation.netAmount,
        operation.currency,
        operation.exchangeRateArsPerUsd,
        state,
      );
      if (operation.type === 'buy') {
        totalBuyCost = this.add(totalBuyCost, amount);
        const unitCost = {
          ars: this.round(amount.ars / operation.quantity),
          usd: this.round(amount.usd / operation.quantity),
        };
        lots.set(key, [
          ...(lots.get(key) ?? []),
          { quantity: operation.quantity, unitCost },
        ]);
        continue;
      }

      totalSellProceeds = this.add(totalSellProceeds, amount);
      let remaining = operation.quantity;
      let soldCost = this.zero();
      const positionLots = lots.get(key) ?? [];
      while (remaining > 0.00000001) {
        const lot = positionLots[0];
        if (!lot) break;
        const consumed = Math.min(remaining, lot.quantity);
        soldCost = this.add(soldCost, {
          ars: lot.unitCost.ars * consumed,
          usd: lot.unitCost.usd * consumed,
        });
        lot.quantity = this.round(lot.quantity - consumed);
        remaining = this.round(remaining - consumed);
        if (lot.quantity <= 0.00000001) positionLots.shift();
      }
      realizedProfit = this.add(
        realizedProfit,
        this.subtract(amount, soldCost),
      );
      lots.set(key, positionLots);
    }

    const openPositions: IOpenPositionSummary[] = [];
    let openPositionValueAtCost = this.zero();
    for (const [key, positionLots] of lots.entries()) {
      const quantity = this.round(
        positionLots.reduce((total, lot) => total + lot.quantity, 0),
      );
      if (quantity <= 0.00000001) continue;
      const invested = positionLots.reduce(
        (total, lot) =>
          this.add(total, {
            ars: lot.unitCost.ars * lot.quantity,
            usd: lot.unitCost.usd * lot.quantity,
          }),
        this.zero(),
      );
      const separator = key.indexOf(':');
      openPositions.push({
        platform: key.slice(0, separator),
        ticker: key.slice(separator + 1),
        quantity,
        averageCost: {
          ars: this.round(invested.ars / quantity),
          usd: this.round(invested.usd / quantity),
        },
        invested,
      });
      openPositionValueAtCost = this.add(openPositionValueAtCost, invested);
    }

    return {
      totalBuyCost,
      totalSellProceeds,
      realizedProfit,
      openPositionValueAtCost,
      openPositions,
    };
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
