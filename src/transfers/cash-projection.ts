import { BadRequestException } from '@nestjs/common';
import type { TransferBookValue, TransferCurrency } from './transfer.contracts';

const scale = 100000000n;
export interface CashProjectionEvent {
  id: string;
  date: Date;
  priority: number;
  platform: string;
  currency: TransferCurrency;
  direction: 'in' | 'out';
  amount: number;
  amountUnits?: string;
  rate?: number | null;
  bookValue?: TransferBookValue;
}
export interface CashPool {
  amount: bigint;
  ars: bigint;
  usd: bigint;
  hasUnconvertedAmounts: boolean;
}

export function moneyUnits(value: number): bigint {
  if (!Number.isFinite(value) || value < 0)
    throw new BadRequestException({
      code: 'INVALID_QUANTITY',
      message: 'El historial contiene un importe no válido.',
    });
  const fixed = value.toFixed(8);
  if (!/^\d+\.\d{8}$/.test(fixed))
    throw new BadRequestException(
      'El importe excede la precisión del registro.',
    );
  return BigInt(fixed.replace('.', ''));
}
export function decimalUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(value))
    throw new BadRequestException('Valor contable inválido.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(8, '0'));
}
export function moneyString(value: bigint): string {
  return `${value / scale}.${(value % scale).toString().padStart(8, '0')}`;
}
export function zeroPool(): CashPool {
  return { amount: 0n, ars: 0n, usd: 0n, hasUnconvertedAmounts: false };
}
export function sliceBookValue(
  pool: CashPool,
  amount: bigint,
): TransferBookValue {
  if (amount > pool.amount || amount < 0n)
    throw new BadRequestException({
      code: 'INSUFFICIENT_BALANCE',
      message:
        'Saldo insuficiente en el objetivo, plataforma y moneda de origen.',
    });
  return {
    ars: moneyString(pool.amount ? (pool.ars * amount) / pool.amount : 0n),
    usd: moneyString(pool.amount ? (pool.usd * amount) / pool.amount : 0n),
    hasUnconvertedAmounts: amount > 0n && pool.hasUnconvertedAmounts,
  };
}

export function projectCash(
  opening: CashProjectionEvent[],
  events: CashProjectionEvent[],
  until: Date,
): Map<string, CashPool> {
  const pools = new Map<string, CashPool>();
  for (const event of [
    ...opening,
    ...events
      .filter((event) => event.date <= until)
      .sort(
        (a, b) =>
          a.date.getTime() - b.date.getTime() ||
          a.priority - b.priority ||
          a.id.localeCompare(b.id),
      ),
  ]) {
    const key = `${event.platform.trim().toUpperCase() || 'GENERAL'}:${event.currency}`;
    const pool = pools.get(key) ?? zeroPool();
    const amount = event.amountUnits
      ? BigInt(event.amountUnits) * 1000000n
      : moneyUnits(event.amount);
    const value =
      event.bookValue ??
      (event.direction === 'out'
        ? sliceBookValue(pool, amount)
        : {
            ars: moneyString(
              event.currency === 'ARS'
                ? amount
                : event.rate
                  ? moneyUnits(event.amount * event.rate)
                  : 0n,
            ),
            usd: moneyString(
              event.currency === 'USD'
                ? amount
                : event.rate
                  ? moneyUnits(event.amount / event.rate)
                  : 0n,
            ),
            hasUnconvertedAmounts: !event.rate,
          });
    const sign = event.direction === 'in' ? 1n : -1n;
    pool.amount += sign * amount;
    pool.ars += sign * decimalUnits(value.ars);
    pool.usd += sign * decimalUnits(value.usd);
    if (pool.amount < 0n || pool.ars < 0n || pool.usd < 0n)
      throw new BadRequestException({
        code: 'INSUFFICIENT_BALANCE',
        message:
          'El historial de caja o su costo contable no permite esta transferencia.',
      });
    pool.hasUnconvertedAmounts =
      pool.amount > 0n &&
      (pool.hasUnconvertedAmounts || value.hasUnconvertedAmounts);
    pools.set(key, pool);
  }
  return pools;
}
