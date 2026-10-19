import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { CashyContributionPreview } from './contribution-preview.contracts';

@Schema({ collection: 'integration_contribution_previews', versionKey: false })
export class ContributionPreview {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ type: Object, required: true }) snapshot: CashyContributionPreview;
  @Prop({ required: true }) expiresAt: Date;
}

export type ContributionPreviewDocument = HydratedDocument<ContributionPreview>;
export const ContributionPreviewSchema =
  SchemaFactory.createForClass(ContributionPreview);
ContributionPreviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
