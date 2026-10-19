import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type {
  NormalizedTransferIntent,
  TransferErrorCode,
  TransferStatus,
  TransferBookValue,
} from '../transfer.contracts';

@Schema({ _id: false })
class StoredEndpoint {
  @Prop({ required: true, match: /^[a-f\d]{24}$/ }) goalId: string;
  @Prop({ required: true, maxlength: 80 }) platform: string;
}
const EndpointSchema = SchemaFactory.createForClass(StoredEndpoint);

@Schema({ _id: false })
class StoredIntent {
  @Prop({ required: true }) idempotencyKey: string;
  @Prop({ required: true, enum: ['cash', 'crypto'] }) kind: string;
  @Prop({ required: true, type: EndpointSchema }) source: StoredEndpoint;
  @Prop({ required: true, type: EndpointSchema }) destination: StoredEndpoint;
  @Prop({ required: true }) unit: string;
  @Prop({ required: true, min: 0, max: 8 }) unitScale: number;
  @Prop({ required: true, match: /^\d+$/ }) quantityUnits: string;
  @Prop({ required: true, match: /^\d+$/ }) feeUnits: string;
  @Prop({ required: true, match: /^\d+$/ }) debitUnits: string;
  @Prop({ type: String, maxlength: 500, default: '' }) notes: string;
  @Prop({ required: true, match: /^[a-f\d]{64}$/ }) fingerprint: string;
}
const IntentSchema = SchemaFactory.createForClass(StoredIntent);

@Schema({ _id: false })
class StoredBookValue {
  @Prop({ required: true, match: /^\d+(\.\d+)?$/ }) ars: string;
  @Prop({ required: true, match: /^\d+(\.\d+)?$/ }) usd: string;
  @Prop({ required: true }) hasUnconvertedAmounts: boolean;
}
const BookValueSchema = SchemaFactory.createForClass(StoredBookValue);

@Schema({ _id: false })
class StoredTransferBookValue {
  @Prop({ required: true, type: BookValueSchema }) delivered: TransferBookValue;
  @Prop({ required: true, type: BookValueSchema })
  commission: TransferBookValue;
}
const TransferBookValueSchema = SchemaFactory.createForClass(
  StoredTransferBookValue,
);

@Schema({
  collection: 'transfers',
  timestamps: true,
  versionKey: false,
  writeConcern: { w: 'majority', wtimeout: 10000 },
})
export class Transfer {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true, immutable: true }) userId: string;
  @Prop({ required: true, immutable: true }) idempotencyKey: string;
  @Prop({ required: true, immutable: true, type: IntentSchema })
  intent: NormalizedTransferIntent;
  @Prop({
    required: true,
    enum: ['pending', 'completed', 'rejected'],
    default: 'pending',
  })
  status: TransferStatus;
  @Prop({ required: true, immutable: true, type: Date }) acceptedAt: Date;
  @Prop({ required: true, immutable: true, type: Date }) effectiveAt: Date;
  @Prop({ required: true, immutable: true }) sourceEntryId: string;
  @Prop({ required: true, immutable: true }) destinationEntryId: string;
  @Prop({ type: String, immutable: true }) commissionEntryId?: string;
  @Prop({ type: Date }) completedAt?: Date;
  @Prop({ type: String }) rejectionCode?: TransferErrorCode;
  @Prop({ type: TransferBookValueSchema }) bookValue?: StoredTransferBookValue;
  createdAt: Date;
  updatedAt: Date;
}

export type TransferDocument = HydratedDocument<Transfer>;
export const TransferSchema = SchemaFactory.createForClass(Transfer);
TransferSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, name: 'transfer_user_idempotency_unique' },
);
TransferSchema.index({
  userId: 1,
  'intent.source.goalId': 1,
  acceptedAt: -1,
  _id: -1,
});
TransferSchema.index({
  userId: 1,
  'intent.destination.goalId': 1,
  acceptedAt: -1,
  _id: -1,
});
TransferSchema.index({ status: 1, acceptedAt: 1 });
