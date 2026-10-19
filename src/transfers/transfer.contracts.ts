import type { GoalReference } from '../goals/goal-references';

export type TransferCurrency = 'ARS' | 'USD';
export type TransferStatus = 'pending' | 'completed' | 'rejected';

export interface TransferEndpoint {
  goalId: string;
  platform: string;
}

interface TransferIntentBase {
  idempotencyKey: string;
  source: TransferEndpoint;
  destination: TransferEndpoint;
  fee: string;
  notes: string;
}

export type TransferIntent =
  | (TransferIntentBase & {
      kind: 'cash';
      currency: TransferCurrency;
      amount: string;
    })
  | (TransferIntentBase & {
      kind: 'crypto';
      assetId: string;
      quantity: string;
    });

export interface TransferAssetPolicy {
  assetId: string;
  classification: 'crypto' | 'equity' | 'unknown';
  quantityScale: number;
}

export interface NormalizedTransferIntent {
  idempotencyKey: string;
  kind: TransferIntent['kind'];
  source: TransferEndpoint;
  destination: TransferEndpoint;
  unit: string;
  unitScale: number;
  quantityUnits: string;
  feeUnits: string;
  debitUnits: string;
  notes: string;
  fingerprint: string;
}

export interface TransferRecord {
  processing?: boolean;
  goals: {
    source: GoalReference;
    destination: GoalReference;
  };
  id: string;
  userId: string;
  intent: NormalizedTransferIntent;
  status: TransferStatus;
  acceptedAt: string;
  effectiveAt: string;
  sourceEntryId: string;
  destinationEntryId: string;
  commissionEntryId?: string;
  completedAt?: string;
  rejectionCode?: TransferErrorCode;
  bookValue?: {
    delivered: TransferBookValue;
    commission: TransferBookValue;
  };
}

export interface TransferBookValue {
  ars: string;
  usd: string;
  hasUnconvertedAmounts: boolean;
}

export type TransferErrorCode =
  | 'TRANSFERS_NOT_ENABLED'
  | 'INVALID_ENDPOINT'
  | 'SAME_ENDPOINT'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'INVALID_CURRENCY'
  | 'ASSET_NOT_TRANSFERABLE'
  | 'INVALID_QUANTITY'
  | 'INVALID_FEE'
  | 'INVALID_NOTES'
  | 'INSUFFICIENT_BALANCE'
  | 'SOURCE_POSITION_MISSING'
  | 'GOAL_UNAVAILABLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESULT_UNKNOWN';

export interface TransferSetupStatus {
  stage: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  enabled: boolean;
  execution: 'record-only';
  currencies: TransferCurrency[];
  assets: 'trusted-crypto-catalog-only';
  maximumCryptoScale: 8;
  sameUnitCommission: true;
  sameGoalAllowed: true;
  sameEndpointAllowed: false;
  conversionAllowed: false;
  backdatingAllowed: false;
  cashyBudgetEffect: 'none';
  coordinator: 'multi-goal';
  requiredCapabilities: string[];
}
