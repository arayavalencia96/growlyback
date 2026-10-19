import { resolveAverageCostAmount } from './average-cost';

describe('resolveAverageCostAmount', () => {
  it('uses the supplied PPC as the average-cost source', () => {
    expect(resolveAverageCostAmount(0.00858831, 65966, 705.34)).toBeCloseTo(
      566.53645746,
      8,
    );
  });

  it('falls back to total invested when PPC is omitted', () => {
    expect(resolveAverageCostAmount(0.00858831, undefined, 705.34)).toBe(
      705.34,
    );
  });
});
