import { BadRequestException } from '@nestjs/common';
import {
  assetForTicker,
  catalogAssets,
  resolveAssetId,
  storedAsset,
} from './asset-catalog';

describe('asset catalog', () => {
  it('marks BTC and USDT as transferable and SPY as non-transferable', () => {
    const assets = catalogAssets();

    expect(
      assets.filter((asset) => asset.transferable).map((asset) => asset.ticker),
    ).toEqual(['BTC', 'USDT']);
    expect(assetForTicker(' spy ')?.transferable).toBe(false);
  });

  it('keeps the stored asset only when id and ticker match', () => {
    expect(storedAsset('btc', 'crypto:bitcoin')?.ticker).toBe('BTC');
    expect(storedAsset('USDT', 'crypto:bitcoin')).toBeUndefined();
  });

  it('rejects an asset id that does not match its ticker', () => {
    expect(() => resolveAssetId('BTC', 'crypto:tether')).toThrow(
      BadRequestException,
    );
  });
});
