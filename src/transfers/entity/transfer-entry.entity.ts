import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type {
  TransferBookValue,
  TransferCurrency,
} from '../transfer.contracts';

@Schema({ _id: false })
class EntryBookValue {
  @Prop({ required: true }) ars: string;
  @Prop({ required: true }) usd: string;
  @Prop({ required: true }) hasUnconvertedAmounts: boolean;
}
const EntryBookValueSchema = SchemaFactory.createForClass(EntryBookValue);

@Schema({ collection: 'transfer_entries', versionKey: false, timestamps: true })
export class TransferEntry {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true, immutable: true }) transferId: string;
  @Prop({ required: true, immutable: true }) userId: string;
  @Prop({ required: true, immutable: true }) goalId: string;
  @Prop({ required: true, immutable: true }) platform: string;
  @Prop({
    required: true,
    immutable: true,
    enum: ['cash_in', 'cash_out', 'cash_fee'],
  })
  kind: 'cash_in' | 'cash_out' | 'cash_fee';
  @Prop({ required: true, immutable: true, enum: ['ARS', 'USD'] })
  currency: TransferCurrency;
  @Prop({ required: true, immutable: true, match: /^[1-9]\d*$/ })
  amountUnits: string;
  @Prop({ type: Date, required: true, immutable: true }) effectiveAt: Date;
  @Prop({ type: EntryBookValueSchema, required: true, immutable: true })
  bookValue: TransferBookValue;
}
export type TransferEntryDocument = HydratedDocument<TransferEntry>;
export const TransferEntrySchema = SchemaFactory.createForClass(TransferEntry);
TransferEntrySchema.index({ transferId: 1, kind: 1 }, { unique: true });
TransferEntrySchema.index({ userId: 1, goalId: 1, effectiveAt: 1, _id: 1 });
