import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type {
  NormalizedTransferIntent,
  TransferAssetPolicy,
  TransferEndpoint,
  TransferErrorCode,
  TransferIntent,
} from './transfer.contracts';

const maximumUnits = BigInt(Number.MAX_SAFE_INTEGER);

function invalid(code: TransferErrorCode, message: string): never {
  throw new BadRequestException({ code, message });
}

function endpoint(value: TransferEndpoint): TransferEndpoint {
  if (
    !value ||
    typeof value.goalId !== 'string' ||
    !/^[a-f\d]{24}$/i.test(value.goalId) ||
    typeof value.platform !== 'string'
  )
    invalid('INVALID_ENDPOINT', 'Elegí un objetivo y una plataforma válidos.');
  const platform = value.platform.trim().toUpperCase();
  if (!platform || platform.length > 80)
    invalid('INVALID_ENDPOINT', 'La plataforma no es válida.');
  return { goalId: value.goalId.toLowerCase(), platform };
}

function units(value: string, scale: number, fee = false): bigint {
  const code = fee ? 'INVALID_FEE' : 'INVALID_QUANTITY';
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    invalid(
      code,
      'Ingresá una cantidad decimal válida, sin exponentes ni separadores de miles.',
    );
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale)
    invalid(code, 'La cantidad supera la precisión permitida.');
  const result = BigInt(whole + fraction.padEnd(scale, '0'));
  if (result > maximumUnits || (!fee && result === 0n))
    invalid(code, 'La cantidad está fuera del rango permitido.');
  return result;
}

export function normalizeTransferIntent(
  intent: TransferIntent,
  asset?: TransferAssetPolicy,
): NormalizedTransferIntent {
  if (
    !intent ||
    typeof intent.idempotencyKey !== 'string' ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
      intent.idempotencyKey,
    )
  )
    invalid(
      'INVALID_IDEMPOTENCY_KEY',
      'La operación requiere un identificador idempotente válido.',
    );
  const source = endpoint(intent.source);
  const destination = endpoint(intent.destination);
  if (
    source.goalId === destination.goalId &&
    source.platform === destination.platform
  )
    invalid('SAME_ENDPOINT', 'El origen y el destino no pueden ser idénticos.');
  let unit: string;
  let scale: number;
  let quantity: string;
  if (intent.kind === 'cash') {
    if (intent.currency !== 'ARS' && intent.currency !== 'USD')
      invalid('INVALID_CURRENCY', 'Solo se permite transferir ARS o USD.');
    unit = intent.currency;
    scale = 2;
    quantity = intent.amount;
  } else if (
    intent.kind === 'crypto' &&
    asset?.classification === 'crypto' &&
    asset.assetId === intent.assetId
  ) {
    if (
      !Number.isInteger(asset.quantityScale) ||
      asset.quantityScale < 0 ||
      asset.quantityScale > 8
    )
      invalid(
        'ASSET_NOT_TRANSFERABLE',
        'La precisión del activo no es compatible con el ledger actual.',
      );
    unit = asset.assetId;
    scale = asset.quantityScale;
    quantity = intent.quantity;
  } else {
    invalid(
      'ASSET_NOT_TRANSFERABLE',
      'Solo se permiten criptomonedas identificadas por el catálogo de Growly.',
    );
  }
  if (typeof intent.notes !== 'string' || intent.notes.trim().length > 500)
    invalid('INVALID_NOTES', 'Las notas admiten hasta 500 caracteres.');
  const quantityUnits = units(quantity, scale);
  const feeUnits = units(intent.fee, scale, true);
  const debit = quantityUnits + feeUnits;
  if (debit > maximumUnits)
    invalid(
      'INVALID_QUANTITY',
      'La cantidad y la comisión exceden el límite permitido.',
    );
  const canonical = {
    kind: intent.kind,
    source,
    destination,
    unit,
    unitScale: scale,
    quantityUnits: quantityUnits.toString(),
    feeUnits: feeUnits.toString(),
    debitUnits: debit.toString(),
    notes: intent.notes.trim(),
  };
  return {
    idempotencyKey: intent.idempotencyKey.toLowerCase(),
    ...canonical,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex'),
  };
}
