import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { CashyContributionPreview } from './contribution-preview.contracts';
import type { ContributionMoney } from './contribution-money';

export type ContributionJobStatus =
  'pending' | 'confirmed' | 'cancelled' | 'reconciliation-required' | 'voided';
@Schema({
  collection: 'integration_contribution_jobs',
  timestamps: true,
  versionKey: false,
})
export class ContributionJob {
  @Prop({ default: false }) cancelRequested: boolean;
  @Prop({ type: Object }) effective?: ContributionMoney;
  @Prop({ default: 1 }) revision: number;
  @Prop({ type: String }) _id: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, index: true }) goalId: string;
  @Prop({ required: true }) movementId: string;
  @Prop({ type: Object, required: true }) snapshot: CashyContributionPreview;
  @Prop({ type: String, default: '' }) notes: string;
  @Prop({ type: Number }) valuationExchangeRateArsPerUsd?: number;
  @Prop({
    required: true,
    enum: [
      'pending',
      'confirmed',
      'cancelled',
      'reconciliation-required',
      'voided',
    ],
  })
  status: ContributionJobStatus;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ required: true }) nextAttemptAt: Date;
  @Prop({ default: '' }) message: string;
  createdAt: Date;
  updatedAt: Date;
}
export type ContributionJobDocument = HydratedDocument<ContributionJob>;
export const ContributionJobSchema =
  SchemaFactory.createForClass(ContributionJob);
ContributionJobSchema.index({ status: 1, nextAttemptAt: 1 });
