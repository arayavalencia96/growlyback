import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  GOAL_CURRENCIES,
  GOAL_STATUSES,
  GOAL_TRACKING_MODES,
  GOAL_TYPES,
} from '../interfaces/goals.interface';
import type {
  GoalCurrency,
  GoalStatus,
  StoredGoalTrackingMode,
  GoalType,
} from '../interfaces/goals.interface';

@Schema({ _id: false })
export class OpeningCashBalance {
  @Prop({ required: true, trim: true, uppercase: true }) platform: string;
  @Prop({ required: true, enum: GOAL_CURRENCIES }) currency: GoalCurrency;
  @Prop({ required: true, min: 0.00000001 }) amount: number;
  @Prop({ type: Number, min: 0.00000001, default: null })
  exchangeRateArsPerUsd?: number | null;
}

const OpeningCashBalanceSchema =
  SchemaFactory.createForClass(OpeningCashBalance);

@Schema({ _id: false })
export class OpeningPosition {
  @Prop({ required: true, trim: true, uppercase: true }) platform: string;
  @Prop({ required: true, trim: true, uppercase: true }) ticker: string;
  @Prop({ required: true, min: 0.00000001 }) quantity: number;
  @Prop({ required: true, min: 0.00000001 }) unitPrice: number;
  @Prop({ required: true, min: 0.00000001 }) totalAmount: number;
  @Prop({ required: true, enum: GOAL_CURRENCIES }) currency: GoalCurrency;
  @Prop({ type: Number, min: 0.00000001, default: null })
  exchangeRateArsPerUsd?: number | null;
}

const OpeningPositionSchema = SchemaFactory.createForClass(OpeningPosition);

@Schema({ timestamps: true, collection: 'goals', versionKey: false })
export class Goal {
  @Prop({ required: true, trim: true, index: true })
  userId: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: GOAL_TYPES, index: true })
  type: GoalType;

  @Prop({ required: true, min: 1 })
  targetAmount: number;

  @Prop({ required: true, enum: GOAL_CURRENCIES })
  currency: GoalCurrency;

  @Prop({ type: Date, default: () => new Date() })
  startDate: Date;

  @Prop({ type: Date, default: null })
  endDate?: Date | null;

  @Prop({ required: true, enum: GOAL_STATUSES, default: 'active', index: true })
  status: GoalStatus;

  @Prop({
    required: true,
    enum: [...GOAL_TRACKING_MODES, 'legacy'],
    default: 'legacy',
  })
  trackingMode: StoredGoalTrackingMode;

  @Prop({ type: [OpeningCashBalanceSchema], default: [] })
  openingCashBalances: OpeningCashBalance[];

  @Prop({ type: [OpeningPositionSchema], default: [] })
  openingPositions: OpeningPosition[];

  @Prop({ type: String, default: null, trim: true })
  notes?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export type GoalDocument = HydratedDocument<Goal>;
export const GoalSchema = SchemaFactory.createForClass(Goal);

GoalSchema.index({ userId: 1, status: 1, createdAt: -1 });
GoalSchema.index({ userId: 1, type: 1, status: 1 });
GoalSchema.index({ name: 'text', notes: 'text' });
