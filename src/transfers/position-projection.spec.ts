import { BadRequestException } from '@nestjs/common';
import { projectPositions } from './position-projection';

describe('position projection', () => {
  it('moves quantity and proportional book value without creating gains', () => {
    const positions = projectPositions(
      [],
      [
        {
          id: '1',
          date: new Date('2026-10-01T12:00:00.000Z'),
          priority: 1,
          platform: 'Nexo',
          ticker: 'BTC',
          direction: 'in',
          quantity: 200_000_000n,
          amount: 200,
          currency: 'USD',
          rate: 1000,
        },
        {
          id: '2',
          date: new Date('2026-10-02T12:00:00.000Z'),
          priority: 1,
          platform: 'NEXO',
          ticker: 'btc',
          direction: 'out',
          quantity: 50_000_000n,
        },
      ],
      new Date('2026-10-03T00:00:00.000Z'),
    );

    expect(positions.get('NEXO:BTC')).toMatchObject({
      amount: 150_000_000n,
      ars: 15_000_000_000_000n,
      usd: 15_000_000_000n,
    });
  });

  it('rejects a position debit that exceeds the available quantity', () => {
    expect(() =>
      projectPositions(
        [],
        [
          {
            id: '1',
            date: new Date('2026-10-01T12:00:00.000Z'),
            priority: 1,
            platform: 'BingX',
            ticker: 'USDT',
            direction: 'out',
            quantity: 1n,
          },
        ],
        new Date('2026-10-02T00:00:00.000Z'),
      ),
    ).toThrow(BadRequestException);
  });
});
