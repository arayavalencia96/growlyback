import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Goal } from '../../goals/entity/goals.entity';
import { GOAL_CURRENCIES } from '../../goals/interfaces/goals.interface';
import type { GoalCurrency } from '../../goals/interfaces/goals.interface';
import { GOAL_MOVEMENT_TYPES } from '../interfaces/goals-movements.interface';
import type { GoalMovementType } from '../interfaces/goals-movements.interface';

@Schema({ timestamps: true, collection: 'goal_movements', versionKey: false })
export class GoalMovement {
  @Prop({ type: Types.ObjectId, ref: Goal.name, required: true, index: true })
  goalId: Types.ObjectId;
  @Prop({ required: true, trim: true, index: true }) userId: string;
  @Prop({ required: true, enum: GOAL_MOVEMENT_TYPES, index: true })
  type: GoalMovementType;
  @Prop({ required: true, min: 0.00000001 }) amount: number;
  @Prop({ required: true, enum: GOAL_CURRENCIES, index: true })
  currency: GoalCurrency;
  @Prop({ type: Date, default: () => new Date(), index: true })
  movementDate: Date;
  @Prop({ type: Number, min: 0.00000001, default: null })
  exchangeRateArsPerUsd?: number | null;
  @Prop({ type: String, trim: true, default: null }) platform?: string | null;
  @Prop({ type: String, trim: true, default: null }) notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GoalMovementDocument = HydratedDocument<GoalMovement>;
export const GoalMovementSchema = SchemaFactory.createForClass(GoalMovement);
GoalMovementSchema.index({ goalId: 1, movementDate: -1 });
GoalMovementSchema.index({ userId: 1, type: 1, movementDate: -1 });
