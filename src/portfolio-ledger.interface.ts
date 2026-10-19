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
  | ICashMovementCandidate
  | IInvestmentOperationCandidate
  | ITransferCashCandidate
  | ITransferAssetCandidate;

export interface ITransferAssetCandidate {
  source: 'asset-transfer';
  id: string;
  platform: string;
  ticker: string;
  date: Date;
  type: 'asset_in' | 'asset_out' | 'asset_fee';
  quantityUnits: string;
  quantityScale: number;
}

export interface ITransferCashCandidate extends ILedgerCandidateBase {
  source: 'transfer';
  type: 'cash_in' | 'cash_out' | 'cash_fee';
  amount: number;
}
