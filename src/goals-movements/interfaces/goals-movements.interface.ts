import type { GoalCurrency } from '../../goals/interfaces/goals.interface';

export const GOAL_MOVEMENT_TYPES = ['contribution', 'withdrawal'] as const;
export type GoalMovementType = (typeof GOAL_MOVEMENT_TYPES)[number];

export interface IGoalMovementBase {
  goalId: string;
  userId: string;
  type: GoalMovementType;
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
