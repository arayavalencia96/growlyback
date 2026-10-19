import { BadRequestException } from '@nestjs/common';
import { normalizeTransferIntent } from './transfer.rules';

const source = { goalId: 'aaaaaaaaaaaaaaaaaaaaaaaa', platform: ' iol ' };
const destination = {
  goalId: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  platform: 'bull market',
};

describe('normalizeTransferIntent', () => {
  it('normalizes an ARS transfer and includes the commission in the debit', () => {
    const result = normalizeTransferIntent({
      idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
      kind: 'cash',
      source,
      destination,
      currency: 'ARS',
      amount: '250000.50',
      fee: '1000',
      notes: '  rebalanceo  ',
    });

    expect(result).toMatchObject({
      unit: 'ARS',
      unitScale: 2,
      quantityUnits: '25000050',
      feeUnits: '100000',
      debitUnits: '25100050',
      notes: 'rebalanceo',
      source: { ...source, platform: 'IOL' },
      destination: { ...destination, platform: 'BULL MARKET' },
    });
    expect(result.fingerprint).toMatch(/^[a-f\d]{64}$/);
  });

  it('accepts only crypto assets enabled by the catalog policy', () => {
    const result = normalizeTransferIntent(
      {
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
        kind: 'crypto',
        source,
        destination,
        assetId: 'crypto:tether',
        quantity: '10.12345678',
        fee: '0.1',
        notes: '',
      },
      {
        assetId: 'crypto:tether',
        classification: 'crypto',
        quantityScale: 8,
      },
    );

    expect(result.quantityUnits).toBe('1012345678');
    expect(result.debitUnits).toBe('1022345678');
  });

  it('rejects equal endpoints and unsupported securities', () => {
    expect(() =>
      normalizeTransferIntent({
        idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
        kind: 'cash',
        source,
        destination: { goalId: source.goalId, platform: 'IOL' },
        currency: 'USD',
        amount: '1',
        fee: '0',
        notes: '',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      normalizeTransferIntent(
        {
          idempotencyKey: '123e4567-e89b-42d3-a456-426614174000',
          kind: 'crypto',
          source,
          destination,
          assetId: 'security:spy',
          quantity: '1',
          fee: '0',
          notes: '',
        },
        {
          assetId: 'security:spy',
          classification: 'equity',
          quantityScale: 8,
        },
      ),
    ).toThrow(BadRequestException);
  });
});
