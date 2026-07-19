import type { GoalCurrency } from '../../goals/interfaces/goals.interface';

export interface IMoneyTotals {
  ars: number;
  usd: number;
}

export interface IOpenPositionSummary {
  platform: string;
  ticker: string;
  quantity: number;
  averageCost: IMoneyTotals;
  invested: IMoneyTotals;
}

export interface ICashBalanceSummary {
  platform: string;
  currency: GoalCurrency;
  amount: number;
}

export interface IPlatformBookValue {
  platform: string;
  value: IMoneyTotals;
}

export interface IGoalSummaryResponse {
  goalId: string;
  userId: string;
  goalName: string;
  goalCurrency: GoalCurrency;
  targetAmount: number;
  contributions: IMoneyTotals;
  withdrawals: IMoneyTotals;
  netContributions: IMoneyTotals;
  totalBuyCost: IMoneyTotals;
  totalSellProceeds: IMoneyTotals;
  realizedProfit: IMoneyTotals;
  cashBalance: IMoneyTotals;
  cashBalances: ICashBalanceSummary[];
  platformBookValues: IPlatformBookValue[];
  openPositionValueAtCost: IMoneyTotals;
  portfolioBookValue: IMoneyTotals;
  progressPercentage: number;
  openPositionsCount: number;
  operationsCount: number;
  hasUnconvertedAmounts: boolean;
  openPositions: IOpenPositionSummary[];
}

export interface IPortfolioSummaryResponse {
  totalBookValue: IMoneyTotals;
  platformBookValues: IPlatformBookValue[];
  goalsCount: number;
  hasUnconvertedAmounts: boolean;
}
