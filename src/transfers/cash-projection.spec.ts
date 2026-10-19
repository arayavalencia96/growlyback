import { BadRequestException } from '@nestjs/common';
import { projectCash, sliceBookValue } from './cash-projection';

describe('cash projection', () => {
  it('projects balances by normalized platform and currency', () => {
    const pools = projectCash(
      [],
      [
        {
          id: '1',
          date: new Date('2026-10-01T12:00:00.000Z'),
          priority: 1,
          platform: ' iol ',
          currency: 'ARS',
          direction: 'in',
          amount: 100,
          rate: 1000,
        },
        {
          id: '2',
          date: new Date('2026-10-02T12:00:00.000Z'),
          priority: 1,
          platform: 'IOL',
          currency: 'ARS',
          direction: 'out',
          amount: 40,
        },
      ],
      new Date('2026-10-03T00:00:00.000Z'),
    );

    expect(pools.get('IOL:ARS')).toMatchObject({
      amount: 6_000_000_000n,
      ars: 6_000_000_000n,
      usd: 6_000_000n,
    });
  });

  it('rejects a debit larger than the projected balance', () => {
    expect(() =>
      projectCash(
        [],
        [
          {
            id: '1',
            date: new Date('2026-10-01T12:00:00.000Z'),
            priority: 1,
            platform: 'IOL',
            currency: 'USD',
            direction: 'out',
            amount: 1,
          },
        ],
        new Date('2026-10-02T00:00:00.000Z'),
      ),
    ).toThrow(BadRequestException);
  });

  it('slices book value proportionally', () => {
    expect(
      sliceBookValue(
        {
          amount: 10n,
          ars: 1000n,
          usd: 100n,
          hasUnconvertedAmounts: false,
        },
        4n,
      ),
    ).toEqual({
      ars: '0.00000400',
      usd: '0.00000040',
      hasUnconvertedAmounts: false,
    });
  });
});
