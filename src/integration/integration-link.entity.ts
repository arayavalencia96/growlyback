import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { AccountLinkView } from './link.contracts';

@Schema({ collection: 'integration_link_projections', versionKey: false })
export class IntegrationLinkProjection {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true, unique: true }) userId: string;
  @Prop({ type: Object, required: true }) link: AccountLinkView;
  @Prop({ required: true }) checkedAt: Date;
}
export type IntegrationLinkProjectionDocument =
  HydratedDocument<IntegrationLinkProjection>;
export const IntegrationLinkProjectionSchema = SchemaFactory.createForClass(
  IntegrationLinkProjection,
);

@Schema({ collection: 'integration_link_revocations', versionKey: false })
export class IntegrationLinkRevocation {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true, unique: true }) linkId: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ type: Object, required: true }) link: AccountLinkView;
  @Prop({ required: true, enum: ['pending', 'completed'] }) status:
    'pending' | 'completed';
  @Prop({ required: true }) requestedAt: Date;
  @Prop({ required: true }) nextAttemptAt: Date;
  @Prop({ default: 0 }) attempts: number;
  @Prop({ type: Date }) completedAt?: Date;
}
export type IntegrationLinkRevocationDocument =
  HydratedDocument<IntegrationLinkRevocation>;
export const IntegrationLinkRevocationSchema = SchemaFactory.createForClass(
  IntegrationLinkRevocation,
);
IntegrationLinkRevocationSchema.index({ status: 1, nextAttemptAt: 1 });
