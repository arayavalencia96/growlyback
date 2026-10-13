import { BadRequestException } from '@nestjs/common';
import type { GoalCurrency } from '../goals/interfaces/goals.interface';

export interface ContributionMoney {
  amountMinor: number;
  allocationAmountMinor: number;
  exchangeRateArsPerUsd: number;
}

export function contributionPeriod(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  return (
    parts.find((part) => part.type === 'year')!.value +
    '-' +
    parts.find((part) => part.type === 'month')!.value
  );
}

export function contributionDate(value: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!dateOnly && !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new BadRequestException('La fecha debe incluir su zona horaria.');
  const date = new Date(dateOnly ? value + 'T00:00:00-03:00' : value);
  if (
    !Number.isFinite(date.getTime()) ||
    (dateOnly && date.toISOString().slice(0, 10) !== value)
  )
    throw new BadRequestException('La fecha del aporte no es válida.');
  return date;
}

export function contributionMoney(
  amount: number,
  currency: GoalCurrency,
  rate?: number | null,
): ContributionMoney {
  const amountMinor = Math.round(amount * 100);
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    Math.abs(amount - amountMinor / 100) >
      Number.EPSILON * Math.max(1, amount) * 2
  )
    throw new BadRequestException(
      'El aporte de Cashy debe ser positivo y tener hasta dos decimales.',
    );
  if (currency === 'ARS')
    return {
      amountMinor,
      allocationAmountMinor: amountMinor,
      exchangeRateArsPerUsd: 1,
    };
  if (
    currency !== 'USD' ||
    typeof rate !== 'number' ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    rate > Number.MAX_SAFE_INTEGER / 100000000 ||
    Number(rate.toFixed(8)) !== rate
  )
    throw new BadRequestException(
      'Indicá una cotización ARS por USD positiva, de hasta ocho decimales.',
    );
  const scaledRate = BigInt(rate.toFixed(8).replace('.', ''));
  const converted = (BigInt(amountMinor) * scaledRate + 50000000n) / 100000000n;
  const allocationAmountMinor = Number(converted);
  if (
    !Number.isSafeInteger(allocationAmountMinor) ||
    allocationAmountMinor <= 0
  )
    throw new BadRequestException(
      'El equivalente en ARS debe ser positivo y estar dentro de la precisión admitida.',
    );
  return { amountMinor, allocationAmountMinor, exchangeRateArsPerUsd: rate };
}
