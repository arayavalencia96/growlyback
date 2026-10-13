import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { ContributionAdjustmentInput } from './contribution-adjustment.contracts';
import type { ContributionMoney } from './contribution-money';

@Schema({
  collection: 'integration_contribution_adjustments',
  timestamps: true,
  versionKey: false,
})
export class ContributionAdjustment {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true }) userId: string;
  @Prop({ required: true }) goalId: string;
  @Prop({ required: true }) contributionId: string;
  @Prop({ type: Object, required: true }) input: ContributionAdjustmentInput;
  @Prop({ type: Object, required: true }) before: ContributionMoney;
  @Prop({ required: true }) reason: string;
  @Prop({ enum: ['pending', 'applied', 'rejected'], required: true }) status:
    'pending' | 'applied' | 'rejected';
  @Prop({ default: '' }) message: string;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ required: true }) nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
export type ContributionAdjustmentDocument =
  HydratedDocument<ContributionAdjustment>;
export const ContributionAdjustmentSchema = SchemaFactory.createForClass(
  ContributionAdjustment,
);
ContributionAdjustmentSchema.index({ status: 1, nextAttemptAt: 1 });
ContributionAdjustmentSchema.index({
  userId: 1,
  contributionId: 1,
  createdAt: -1,
});
