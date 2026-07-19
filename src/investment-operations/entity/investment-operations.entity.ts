import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Goal } from '../../goals/entity/goals.entity';
import { GOAL_CURRENCIES } from '../../goals/interfaces/goals.interface';
import type { GoalCurrency } from '../../goals/interfaces/goals.interface';
import { INVESTMENT_OPERATION_TYPES } from '../interfaces/investment-operations.interface';
import type { InvestmentOperationType } from '../interfaces/investment-operations.interface';

@Schema({
  timestamps: true,
  collection: 'investment_operations',
  versionKey: false,
})
export class InvestmentOperation {
  @Prop({ type: Types.ObjectId, ref: Goal.name, required: true, index: true })
  goalId: Types.ObjectId;
  @Prop({ required: true, trim: true, index: true }) userId: string;
  @Prop({ required: true, trim: true, uppercase: true, index: true })
  platform: string;
  @Prop({ required: true, trim: true, uppercase: true, index: true })
  ticker: string;
  @Prop({ required: true, enum: INVESTMENT_OPERATION_TYPES, index: true })
  type: InvestmentOperationType;
  @Prop({ type: Date, default: () => new Date(), index: true })
  operationDate: Date;
  @Prop({ required: true, min: 0.00000001 }) quantity: number;
  @Prop({ required: true, min: 0.00000001 }) unitPrice: number;
  @Prop({ type: Number, min: 0.00000001, default: null })
  totalAmount?: number | null;
  @Prop({ required: true, min: 0, default: 0 }) fees: number;
  @Prop({ required: true, min: 0 }) grossAmount: number;
  @Prop({ required: true, min: 0 }) netAmount: number;
  @Prop({ required: true, enum: GOAL_CURRENCIES, index: true })
  currency: GoalCurrency;
  @Prop({ type: Number, min: 0.00000001, default: null })
  exchangeRateArsPerUsd?: number | null;
  @Prop({ type: String, trim: true, default: null }) notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InvestmentOperationDocument = HydratedDocument<InvestmentOperation>;
export const InvestmentOperationSchema =
  SchemaFactory.createForClass(InvestmentOperation);
InvestmentOperationSchema.index({
  goalId: 1,
  platform: 1,
  ticker: 1,
  operationDate: 1,
});
InvestmentOperationSchema.index({ userId: 1, operationDate: -1 });
