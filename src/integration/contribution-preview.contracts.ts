import type { GoalCurrency } from '../goals/interfaces/goals.interface';

export interface CashyContributionPreview {
  id: string;
  status: 'prepared';
  source: 'cashy';
  goalId: string;
  linkId: string;
  allocationId: string;
  allocationVersion: number;
  period: string;
  platform: string;
  movementDate: string;
  currency: GoalCurrency;
  amountMinor: number;
  allocationAmountMinor: number;
  exchangeRateArsPerUsd: number;
  availableMinor: number;
  expiresAt: string;
}
