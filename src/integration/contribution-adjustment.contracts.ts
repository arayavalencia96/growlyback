export interface ContributionAdjustmentIdentity {
  id: string;
  contributionId: string;
  growlyUserId: string;
  linkId: string;
}
export interface ContributionAdjustmentInput extends ContributionAdjustmentIdentity {
  expectedRevision: number;
  kind: 'edit' | 'void';
  amountMinor: number;
  allocationAmountMinor: number;
  exchangeRateArsPerUsd: number;
}
export interface ContributionAdjustmentReceipt extends ContributionAdjustmentInput {
  status: 'applied' | 'rejected';
  revision: number;
  reason: string;
}
export type ContributionAdjustmentLookup =
  | ContributionAdjustmentReceipt
  | (ContributionAdjustmentIdentity & { status: 'missing' });

export function isAdjustmentLookup(
  value: unknown,
): value is ContributionAdjustmentLookup {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (
    ['id', 'contributionId', 'growlyUserId', 'linkId'].some(
      (key) => typeof row[key] !== 'string',
    )
  )
    return false;
  if (row.status === 'missing') return true;
  return (
    ['applied', 'rejected'].includes(String(row.status)) &&
    ['edit', 'void'].includes(String(row.kind)) &&
    typeof row.reason === 'string' &&
    [
      'expectedRevision',
      'revision',
      'amountMinor',
      'allocationAmountMinor',
    ].every(
      (key) => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0,
    ) &&
    typeof row.exchangeRateArsPerUsd === 'number' &&
    Number.isFinite(row.exchangeRateArsPerUsd) &&
    row.exchangeRateArsPerUsd > 0
  );
}
