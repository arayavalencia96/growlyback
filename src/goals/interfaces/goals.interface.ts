export const GOAL_TYPES = ['long_term', 'short_term'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_STATUSES = ['active', 'paused', 'completed'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_CURRENCIES = ['ARS', 'USD'] as const;
export type GoalCurrency = (typeof GOAL_CURRENCIES)[number];

export interface IGoalBase {
  userId: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currency: GoalCurrency;
  startDate: Date;
  endDate?: Date | null;
  status: GoalStatus;
  notes?: string | null;
}

export interface ICreateGoalInput {
  userId: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currency: GoalCurrency;
  startDate?: Date;
  endDate?: Date | null;
  status?: GoalStatus;
  notes?: string | null;
}

export interface IUpdateGoalInput {
  name?: string;
  type?: GoalType;
  targetAmount?: number;
  currency?: GoalCurrency;
  startDate?: Date;
  endDate?: Date | null;
  status?: GoalStatus;
  notes?: string | null;
}

export interface IGoalsQuery {
  userId?: string;
  type?: GoalType;
  status?: GoalStatus;
  currency?: GoalCurrency;
  search?: string;
  limit?: number;
  skip?: number;
}

export interface IGoalResponse extends Omit<
  IGoalBase,
  'startDate' | 'endDate'
> {
  id: string;
  startDate: string;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}
