import type { GoalCurrency } from './goals/interfaces/goals.interface';

interface ILedgerCandidateBase {
  id: string;
  platform: string;
  currency: GoalCurrency;
  date: Date;
}

export interface ICashMovementCandidate extends ILedgerCandidateBase {
  source: 'movement';
  type: 'contribution' | 'withdrawal';
  amount: number;
}

export interface IInvestmentOperationCandidate extends ILedgerCandidateBase {
  source: 'operation';
  type: 'buy' | 'sell';
  ticker: string;
  quantity: number;
  totalAmount: number;
}

export type PortfolioLedgerCandidate =
  ICashMovementCandidate | IInvestmentOperationCandidate;
