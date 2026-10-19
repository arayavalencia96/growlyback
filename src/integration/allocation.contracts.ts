import type { MonthlyAllocation } from './integration.contracts';

export type AllocationState =
  | { status: 'not-configured'; period: string }
  | {
      status: 'available';
      allocation: MonthlyAllocation;
      budgetDefined: boolean;
    };

export type LinkedAllocationState =
  | AllocationState
  | {
      status: 'not-linked' | 'access-paused' | 'disabled';
    };

export function isAllocationState(value: unknown): value is AllocationState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  if (state.status === 'not-configured') return validPeriod(state.period);
  if (
    state.status !== 'available' ||
    typeof state.budgetDefined !== 'boolean' ||
    !state.allocation ||
    typeof state.allocation !== 'object'
  )
    return false;
  const allocation = state.allocation as Record<string, unknown>;
  const fields = [
    'assignedMinor',
    'contributedMinor',
    'reservedMinor',
    'availableMinor',
    'excessMinor',
    'version',
  ];
  if (
    allocation.currency !== 'ARS' ||
    typeof allocation.id !== 'string' ||
    !/^[a-f0-9]{64}$/.test(allocation.id) ||
    !validPeriod(allocation.period) ||
    !fields.every(
      (key) =>
        Number.isSafeInteger(allocation[key]) &&
        (allocation[key] as number) >= 0,
    )
  )
    return false;
  const assigned = allocation.assignedMinor as number;
  const legacy = allocation.legacyCommittedMinor ?? 0;
  if (
    !Number.isSafeInteger(legacy) ||
    (legacy as number) < 0 ||
    (allocation.legacyReviewRequired !== undefined &&
      typeof allocation.legacyReviewRequired !== 'boolean')
  )
    return false;
  const occupied =
    (allocation.contributedMinor as number) +
    (allocation.reservedMinor as number) +
    (legacy as number);
  return (
    Number.isSafeInteger(occupied) &&
    (allocation.version as number) > 0 &&
    allocation.availableMinor ===
      (allocation.legacyReviewRequired
        ? 0
        : Math.max(0, assigned - occupied)) &&
    allocation.excessMinor === Math.max(0, occupied - assigned)
  );
}

function validPeriod(value: unknown): value is string {
  return typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
}
