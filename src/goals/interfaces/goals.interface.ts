export const GOAL_TYPES = ['long_term', 'short_term', 'medium_term'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_STATUSES = ['active', 'paused', 'completed'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_CURRENCIES = ['ARS', 'USD'] as const;
export type GoalCurrency = (typeof GOAL_CURRENCIES)[number];

export const GOAL_TRACKING_MODES = [
  'from_scratch',
  'existing_portfolio',
] as const;
export type GoalTrackingMode = (typeof GOAL_TRACKING_MODES)[number];
export type StoredGoalTrackingMode = GoalTrackingMode | 'legacy';

export interface IOpeningCashBalance {
  platform: string;
  currency: GoalCurrency;
  amount: number;
  exchangeRateArsPerUsd?: number | null;
}

export interface IOpeningPosition {
  platform: string;
  ticker: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: GoalCurrency;
  exchangeRateArsPerUsd?: number | null;
}

export interface IGoalBase {
  userId: string;
  name: string;
  type: GoalType;
  targetAmount: number;
  currency: GoalCurrency;
  startDate: Date;
  endDate?: Date | null;
  status: GoalStatus;
  trackingMode: StoredGoalTrackingMode;
  openingCashBalances: IOpeningCashBalance[];
  openingPositions: IOpeningPosition[];
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
  trackingMode: GoalTrackingMode;
  openingCashBalances?: IOpeningCashBalance[];
  openingPositions?: IOpeningPosition[];
  notes?: string | null;
}

export interface IUpdateGoalInput {
  name?: string;
  type?: GoalType;
  targetAmount?: number;
  currency?: GoalCurrency;
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
