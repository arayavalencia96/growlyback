import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientSession } from 'mongoose';
import { ConflictException } from '@nestjs/common';

export interface LedgerContext {
  session: ClientSession;
  userId: string;
  goalIds: readonly string[];
  lockIds: ReadonlyMap<string, string>;
  requireActive: boolean;
  allowDeleted?: boolean;
}
export const ledgerContext = new AsyncLocalStorage<LedgerContext>();
export const ledgerReadContext = new AsyncLocalStorage<ClientSession>();
export function ledgerSession(): ClientSession | null {
  return (
    ledgerContext.getStore()?.session ?? ledgerReadContext.getStore() ?? null
  );
}
export function transactionSession(): ClientSession {
  const session = ledgerContext.getStore()?.session;
  if (!session?.inTransaction())
    throw new Error('La escritura requiere una transacción del ledger.');
  return session;
}

export function transactionSessionForGoals(
  userId: string,
  goalIds: readonly string[],
): ClientSession {
  const session = transactionSession();
  const context = ledgerContext.getStore();
  if (
    !context ||
    context.userId !== userId ||
    !goalIds.length ||
    goalIds.some((id) => !context.goalIds.includes(id.toLowerCase()))
  )
    throw new ConflictException(
      'La operación excede los objetivos o el usuario de esta transacción.',
    );
  return session;
}
