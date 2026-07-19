import type { GoalCurrency } from '../../goals/interfaces/goals.interface';

export const INVESTMENT_OPERATION_TYPES = ['buy', 'sell'] as const;
export type InvestmentOperationType =
  (typeof INVESTMENT_OPERATION_TYPES)[number];

export interface IInvestmentOperationBase {
  goalId: string;
  userId: string;
  platform: string;
  ticker: string;
  type: InvestmentOperationType;
  operationDate: Date;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: GoalCurrency;
  exchangeRateArsPerUsd?: number | null;
  notes?: string | null;
}

export interface IInvestmentOperationResponse extends Omit<
  IInvestmentOperationBase,
  'operationDate'
> {
  id: string;
  operationDate: string;
  createdAt: string;
  updatedAt: string;
}
