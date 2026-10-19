export interface ReserveContributionInput {
  id: string;
  growlyUserId: string;
  growlyMovementId: string;
  linkId: string;
  allocationId: string;
  period: string;
  currency: 'ARS' | 'USD';
  amountMinor: number;
  allocationAmountMinor: number;
  exchangeRateArsPerUsd: number;
  validUntil: string;
}
export interface ContributionIdentity {
  id: string;
  growlyUserId: string;
  linkId: string;
}
export interface ContributionReceipt {
  id: string;
  status: 'reserved' | 'confirmed' | 'cancelled';
  allocationId: string;
  allocationAmountMinor: number;
  growlyMovementId: string;
  expiresAt: string;
  reason: string;
}
export type ContributionLookup =
  ContributionReceipt | { id: string; status: 'missing' };

export function isContributionLookup(
  value: unknown,
): value is ContributionLookup {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string') return false;
  if (row.status === 'missing') return true;
  return (
    ['reserved', 'confirmed', 'cancelled'].includes(String(row.status)) &&
    typeof row.allocationId === 'string' &&
    typeof row.growlyMovementId === 'string' &&
    Number.isSafeInteger(row.allocationAmountMinor) &&
    (row.allocationAmountMinor as number) > 0 &&
    typeof row.expiresAt === 'string' &&
    Number.isFinite(Date.parse(row.expiresAt)) &&
    typeof row.reason === 'string'
  );
}
