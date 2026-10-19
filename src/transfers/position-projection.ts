import { BadRequestException } from '@nestjs/common';
import {
  decimalUnits,
  moneyString,
  moneyUnits,
  sliceBookValue,
  zeroPool,
  type CashPool,
} from './cash-projection';
import type { TransferBookValue, TransferCurrency } from './transfer.contracts';

export interface PositionProjectionEvent {
  id: string;
  date: Date;
  priority: number;
  platform: string;
  ticker: string;
  direction: 'in' | 'out';
  quantity: bigint;
  amount?: number;
  currency?: TransferCurrency;
  rate?: number | null;
  bookValue?: TransferBookValue;
}

export function projectPositions(
  opening: PositionProjectionEvent[],
  events: PositionProjectionEvent[],
  until: Date,
  pools = new Map<string, CashPool>(),
): Map<string, CashPool> {
  for (const event of [
    ...opening,
    ...events
      .filter((item) => item.date <= until)
      .sort(
        (a, b) =>
          a.date.getTime() - b.date.getTime() ||
          a.priority - b.priority ||
          a.id.localeCompare(b.id),
      ),
  ]) {
    const key = `${event.platform.trim().toUpperCase()}:${event.ticker.trim().toUpperCase()}`;
    const pool = pools.get(key) ?? zeroPool();
    if (event.quantity <= 0n)
      throw new BadRequestException({
        code: 'INVALID_QUANTITY',
        message: 'La posición contiene una cantidad inválida.',
      });
    const book =
      event.bookValue ??
      (event.direction === 'out'
        ? sliceBookValue(pool, event.quantity)
        : {
            ars: moneyString(
              event.currency === 'ARS'
                ? moneyUnits(event.amount ?? 0)
                : event.rate
                  ? moneyUnits((event.amount ?? 0) * event.rate)
                  : 0n,
            ),
            usd: moneyString(
              event.currency === 'USD'
                ? moneyUnits(event.amount ?? 0)
                : event.rate
                  ? moneyUnits((event.amount ?? 0) / event.rate)
                  : 0n,
            ),
            hasUnconvertedAmounts: !event.rate,
          });
    const sign = event.direction === 'in' ? 1n : -1n;
    pool.amount += sign * event.quantity;
    pool.ars += sign * decimalUnits(book.ars);
    pool.usd += sign * decimalUnits(book.usd);
    if (pool.amount < 0n || pool.ars < 0n || pool.usd < 0n)
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        message:
          'La cantidad o el costo contable de la posición no permiten la transferencia.',
      });
    pool.hasUnconvertedAmounts =
      pool.amount > 0n &&
      (pool.hasUnconvertedAmounts || book.hasUnconvertedAmounts);
    pools.set(key, pool);
  }
  return pools;
}
