import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  GOAL_CURRENCIES,
  GOAL_STATUSES,
  GOAL_TYPES,
} from '../interfaces/goals.interface';
import type {
  GoalCurrency,
  GoalStatus,
  GoalType,
} from '../interfaces/goals.interface';

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
