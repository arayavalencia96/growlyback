import { BadRequestException } from '@nestjs/common';
import type { TransferAssetPolicy } from '../transfers/transfer.contracts';

export interface CatalogAsset extends TransferAssetPolicy {
  ticker: string;
  name: string;
  transferable: boolean;
}

const CATALOG: readonly Readonly<CatalogAsset>[] = Object.freeze([
  Object.freeze({
    assetId: 'crypto:bitcoin',
    ticker: 'BTC',
    name: 'Bitcoin',
    classification: 'crypto',
    quantityScale: 8,
    transferable: true,
  }),
  Object.freeze({
    assetId: 'crypto:tether',
    ticker: 'USDT',
    name: 'Tether USDt',
    classification: 'crypto',
    quantityScale: 8,
    transferable: true,
  }),
  Object.freeze({
    assetId: 'security:spy',
    ticker: 'SPY',
    name: 'SPDR S&P 500 ETF',
    classification: 'equity',
    quantityScale: 8,
    transferable: false,
  }),
]);

export function catalogAssets(): CatalogAsset[] {
  return CATALOG.map((asset) => ({ ...asset }));
}

export function catalogAsset(assetId: string): CatalogAsset | undefined {
  const asset = CATALOG.find((item) => item.assetId === assetId);
  return asset ? { ...asset } : undefined;
}

export function assetForTicker(ticker: string): CatalogAsset | undefined {
  const symbol = ticker.trim().toUpperCase();
  const asset = CATALOG.find((item) => item.ticker === symbol);
  return asset ? { ...asset } : undefined;
}

export function resolveAssetId(ticker: string, requestedId?: string): string {
  const asset = assetForTicker(ticker);
  if (requestedId !== undefined && (!asset || asset.assetId !== requestedId)) {
    throw new BadRequestException({
      code: 'ASSET_ID_MISMATCH',
      message:
        'El identificador del activo no corresponde al símbolo del catálogo.',
    });
  }
  return asset?.assetId ?? '';
}

export function storedAsset(
  ticker: string,
  assetId?: string,
): CatalogAsset | undefined {
  if (!assetId) return undefined;
  const asset = catalogAsset(assetId);
  return asset?.ticker === ticker.trim().toUpperCase() ? asset : undefined;
}
