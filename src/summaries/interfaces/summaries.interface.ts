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
  openPositionValueAtCost: IMoneyTotals;
  portfolioBookValue: IMoneyTotals;
  progressPercentage: number;
  openPositionsCount: number;
  operationsCount: number;
  hasUnconvertedAmounts: boolean;
  openPositions: IOpenPositionSummary[];
}
