import type { GoalCurrency } from '../../goals/interfaces/goals.interface';

export const GOAL_MOVEMENT_TYPES = ['contribution', 'withdrawal'] as const;
export type GoalMovementType = (typeof GOAL_MOVEMENT_TYPES)[number];
export const CONTRIBUTION_FUNDING_SOURCES = ['external', 'cashy'] as const;
export type ContributionFundingSource =
  (typeof CONTRIBUTION_FUNDING_SOURCES)[number];
export type StoredFundingSource = ContributionFundingSource | 'legacy';

export interface IGoalMovementBase {
  goalId: string;
  userId: string;
  type: GoalMovementType;
  fundingSource?: StoredFundingSource;
  amount: number;
  currency: GoalCurrency;
  movementDate: Date;
  exchangeRateArsPerUsd?: number | null;
  platform?: string | null;
  notes?: string | null;
}

export interface IGoalMovementResponse extends Omit<
  IGoalMovementBase,
  'movementDate'
> {
  id: string;
  movementDate: string;
  createdAt: string;
  updatedAt: string;
}
