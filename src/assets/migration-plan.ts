import { assetForTicker, storedAsset } from './asset-catalog';

export interface AssetReference {
  ticker: string;
  assetId?: string | null;
}

export type AssetMigrationDecision =
  | { status: 'proposed'; ticker: string; assetId: string }
  | { status: 'identified' | 'unknown' | 'conflict'; ticker: string };

export function planAssetIdentification(
  reference: AssetReference,
): AssetMigrationDecision {
  const ticker = reference.ticker.trim().toUpperCase();
  if (reference.assetId) {
    return {
      status: storedAsset(ticker, reference.assetId)
        ? 'identified'
        : 'conflict',
      ticker,
    };
  }
  const asset = assetForTicker(ticker);
  return asset
    ? { status: 'proposed', ticker, assetId: asset.assetId }
    : { status: 'unknown', ticker };
}
