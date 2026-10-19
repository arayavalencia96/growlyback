import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import type { TransferBookValue } from '../transfer.contracts';

@Schema({ _id: false })
class CryptoBookValue {
  @Prop({ required: true }) ars: string;
  @Prop({ required: true }) usd: string;
  @Prop({ required: true }) hasUnconvertedAmounts: boolean;
}
const CryptoBookValueSchema = SchemaFactory.createForClass(CryptoBookValue);

@Schema({
  collection: 'crypto_transfer_entries',
  versionKey: false,
  timestamps: true,
})
export class CryptoTransferEntry {
  @Prop({ type: String, required: true }) _id: string;
  @Prop({ required: true, immutable: true }) transferId: string;
  @Prop({ required: true, immutable: true }) userId: string;
  @Prop({ required: true, immutable: true }) goalId: string;
  @Prop({ required: true, immutable: true }) platform: string;
  @Prop({ required: true, immutable: true }) assetId: string;
  @Prop({ required: true, immutable: true }) ticker: string;
  @Prop({
    required: true,
    immutable: true,
    enum: ['asset_in', 'asset_out', 'asset_fee'],
  })
  kind: 'asset_in' | 'asset_out' | 'asset_fee';
  @Prop({ required: true, immutable: true, match: /^[1-9]\d*$/ })
  quantityUnits: string;
  @Prop({ required: true, immutable: true, min: 0, max: 8 })
  quantityScale: number;
  @Prop({ type: Date, required: true, immutable: true }) effectiveAt: Date;
  @Prop({ type: CryptoBookValueSchema, required: true, immutable: true })
  bookValue: TransferBookValue;
}
export type CryptoTransferEntryDocument = HydratedDocument<CryptoTransferEntry>;
export const CryptoTransferEntrySchema =
  SchemaFactory.createForClass(CryptoTransferEntry);
CryptoTransferEntrySchema.index({ transferId: 1, kind: 1 }, { unique: true });
CryptoTransferEntrySchema.index({
  userId: 1,
  goalId: 1,
  effectiveAt: 1,
  _id: 1,
});
