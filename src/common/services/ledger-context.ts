import { AsyncLocalStorage } from 'node:async_hooks';
import type { ClientSession } from 'mongoose';

export const ledgerContext = new AsyncLocalStorage<{
  session: ClientSession;
  goalId: string;
  userId: string;
}>();
export function ledgerSession(): ClientSession | null {
  return ledgerContext.getStore()?.session ?? null;
}
export function transactionSession(): ClientSession {
  const session = ledgerSession();
  if (!session)
    throw new Error('La escritura requiere una transacción del ledger.');
  return session;
}
