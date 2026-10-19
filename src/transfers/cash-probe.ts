import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createConnection, Types } from 'mongoose';
import { LedgerCoordinator } from '../common/services/ledger-coordinator.service';
import { DatabaseService } from '../common/services/database.service';
import {
  Goal,
  GoalSchema,
  type GoalDocument,
} from '../goals/entity/goals.entity';
import { GoalsService } from '../goals/goals.service';
import {
  GoalMovementSchema,
  type GoalMovementDocument,
} from '../goals-movements/entity/goals-movements.entity';
import {
  InvestmentOperationSchema,
  type InvestmentOperationDocument,
} from '../investment-operations/entity/investment-operations.entity';
import { PortfolioLedgerService } from '../portfolio-ledger.service';
import {
  TransferSchema,
  type TransferDocument,
} from './entity/transfer.entity';
import {
  TransferEntrySchema,
  type TransferEntryDocument,
} from './entity/transfer-entry.entity';
import { TransfersRepository } from './transfers.repository';
import { CashTransfersService } from './cash-transfers.service';
import { TransferExecutionService } from './transfer-execution.service';
import {
  CryptoTransferEntrySchema,
  type CryptoTransferEntryDocument,
} from './entity/crypto-transfer-entry.entity';
import type { TransferIntent } from './transfer.contracts';

export async function cashProbe(
  uri: string,
  databaseName: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Production cash probe is disabled.');
  const prefix = `_growly_cash_check_${randomUUID().replaceAll('-', '')}_`;
  const names = [
    'goals',
    'movements',
    'operations',
    'transfers',
    'entries',
    'crypto',
  ].map((suffix) => prefix + suffix);
  const created: string[] = [];
  const cleanupFailures: string[] = [];
  const connection = createConnection(uri, {
    dbName: databaseName,
    autoIndex: false,
    autoCreate: false,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });
  try {
    await connection.asPromise();
    const db = connection.db;
    if (!db) throw new Error('Cash probe database unavailable.');
    for (const name of names) {
      await db.createCollection(name);
      created.push(name);
    }
    const goals = connection.model<GoalDocument>(
      Goal.name,
      GoalSchema.clone(),
      names[0],
    );
    const movements = connection.model<GoalMovementDocument>(
      'CashProbeMovement',
      GoalMovementSchema.clone(),
      names[1],
    );
    const operations = connection.model<InvestmentOperationDocument>(
      'CashProbeOperation',
      InvestmentOperationSchema.clone(),
      names[2],
    );
    const transfers = connection.model<TransferDocument>(
      'CashProbeTransfer',
      TransferSchema.clone(),
      names[3],
    );
    const entries = connection.model<TransferEntryDocument>(
      'CashProbeEntry',
      TransferEntrySchema.clone(),
      names[4],
    );
    const cryptoEntries = connection.model<CryptoTransferEntryDocument>(
      'CashProbeCryptoEntry',
      CryptoTransferEntrySchema.clone(),
      names[5],
    );
    const coordinator = new LedgerCoordinator(connection, goals);
    const goalsService = new GoalsService(
      coordinator,
      goals,
      new DatabaseService(),
    );
    const ledger = new PortfolioLedgerService(
      movements,
      operations,
      goalsService,
      entries,
      cryptoEntries,
    );
    const repository = new TransfersRepository(transfers, goals);
    await repository.onModuleInit();
    await entries.createIndexes();
    const execution = new TransferExecutionService(
      coordinator,
      repository,
      ledger,
      transfers,
      goals,
    );
    const engine = new CashTransfersService(
      execution,
      entries,
      goals,
      movements,
      operations,
    );
    const source = '111111111111111111111111';
    const destination = '222222222222222222222222';
    const raceSource = '333333333333333333333333';
    const userId = 'cash-probe-fixture';
    for (const id of [source, destination, raceSource])
      await goals.create({
        _id: new Types.ObjectId(id),
        userId,
        name: 'Temporary cash diagnostic',
        type: 'short_term',
        targetAmount: 1000000,
        currency: 'ARS',
        status: 'active',
        trackingMode:
          id === destination ? 'from_scratch' : 'existing_portfolio',
        startDate: new Date('2020-01-01T00:00:00Z'),
        openingCashBalances:
          id === destination
            ? []
            : [
                {
                  platform: 'IOL',
                  currency: 'ARS',
                  amount: 1000,
                  exchangeRateArsPerUsd: 1000,
                },
                {
                  platform: 'IOL',
                  currency: 'USD',
                  amount: 200,
                  exchangeRateArsPerUsd: 1000,
                },
              ],
      });
    const intent = (
      overrides: Partial<Extract<TransferIntent, { kind: 'cash' }>> = {},
    ): TransferIntent => ({
      kind: 'cash',
      currency: 'ARS',
      amount: '250',
      fee: '5',
      notes: 'Temporary diagnostic',
      idempotencyKey: randomUUID(),
      source: { goalId: source, platform: 'IOL' },
      destination: { goalId: destination, platform: 'BULLMARKET' },
      ...overrides,
    });
    const input = intent();
    const accepted = await repository.accept(userId, input);
    const completed = await engine.execute(userId, accepted.record.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.bookValue?.delivered.ars, '250.00000000');
    assert.equal(completed.bookValue?.delivered.usd, '0.25000000');
    assert.equal(completed.bookValue?.commission.ars, '5.00000000');
    assert.equal(await entries.countDocuments({ transferId: completed.id }), 3);
    assert.equal((await engine.execute(userId, completed.id)).id, completed.id);
    const replay = await repository.accept(userId, input);
    assert.equal(replay.replayed, true);
    assert.equal(replay.record.status, 'completed');
    assert.equal(await entries.countDocuments({ transferId: completed.id }), 3);
    const sourceDebit = await entries.findOne({
      transferId: completed.id,
      kind: 'cash_out',
    });
    const destinationCredit = await entries.findOne({
      transferId: completed.id,
      kind: 'cash_in',
    });
    assert.equal(
      JSON.stringify(sourceDebit?.bookValue),
      JSON.stringify(destinationCredit?.bookValue),
    );
    const dollar = await repository.accept(
      userId,
      intent({ currency: 'USD', amount: '50', fee: '1' }),
    );
    assert.equal(
      (await engine.execute(userId, dollar.record.id)).status,
      'completed',
    );
    const dollarEntries = await entries.find({ transferId: dollar.record.id });
    assert.equal(dollarEntries.length, 3);
    assert.ok(dollarEntries.every((item) => item.currency === 'USD'));
    const missing = await repository.accept(
      userId,
      intent({
        source: { goalId: source, platform: 'UNKNOWN' },
        amount: '1',
        fee: '0',
      }),
    );
    assert.equal(
      (await engine.execute(userId, missing.record.id)).rejectionCode,
      'INSUFFICIENT_BALANCE',
    );
    assert.equal(
      await entries.countDocuments({ transferId: missing.record.id }),
      0,
    );
    const insufficient = await repository.accept(
      userId,
      intent({ amount: '745', fee: '0.01' }),
    );
    assert.equal(
      (await engine.execute(userId, insufficient.record.id)).status,
      'rejected',
    );
    assert.equal(
      await entries.countDocuments({ transferId: insufficient.record.id }),
      0,
    );
    const internal = await repository.accept(
      userId,
      intent({
        amount: '100',
        fee: '0',
        destination: { goalId: source, platform: 'NEXO' },
      }),
    );
    assert.equal(
      (await engine.execute(userId, internal.record.id)).status,
      'completed',
    );
    const race = await Promise.all([
      repository.accept(
        userId,
        intent({
          source: { goalId: raceSource, platform: 'IOL' },
          amount: '800',
          fee: '0',
        }),
      ),
      repository.accept(
        userId,
        intent({
          source: { goalId: raceSource, platform: 'IOL' },
          amount: '800',
          fee: '0',
        }),
      ),
    ]);
    const results = await Promise.all(
      race.map((row) => engine.execute(userId, row.record.id)),
    );
    assert.equal(results.filter((row) => row.status === 'completed').length, 1);
    assert.equal(results.filter((row) => row.status === 'rejected').length, 1);
    const beforeRollback = await entries.countDocuments();
    const pending = await repository.accept(
      userId,
      intent({ amount: '10', fee: '0' }),
    );
    const failingLedger = new PortfolioLedgerService(
      movements,
      operations,
      goalsService,
      entries,
      cryptoEntries,
    );
    let validations = 0;
    failingLedger.validate = () => {
      validations++;
      return validations === 3
        ? Promise.reject(new Error('Injected post-insert failure'))
        : Promise.resolve();
    };
    const failingExecution = new TransferExecutionService(
      coordinator,
      repository,
      failingLedger,
      transfers,
      goals,
    );
    const failingEngine = new CashTransfersService(
      failingExecution,
      entries,
      goals,
      movements,
      operations,
    );
    await assert.rejects(() =>
      failingEngine.execute(userId, pending.record.id),
    );
    assert.equal(await entries.countDocuments(), beforeRollback);
    assert.equal(
      (await repository.findOne(userId, pending.record.id)).status,
      'pending',
    );
    assert.equal(
      (await engine.execute(userId, pending.record.id)).status,
      'completed',
    );
    await assert.rejects(() =>
      ledger.validate(source, userId, {
        source: 'movement',
        id: 'new',
        type: 'contribution',
        amount: 1,
        platform: 'IOL',
        currency: 'ARS',
        date: new Date('2021-01-01'),
      }),
    );
    assert.equal(
      await goals.countDocuments({ hasCashyContributionHistory: true }),
      0,
    );
    assert.equal(await goals.countDocuments({ hasTransferHistory: true }), 3);
    for (const id of [source, destination, raceSource])
      await ledger.validate(id, userId, undefined, undefined, true);
    const pendingDeletion = await repository.accept(
      userId,
      intent({ amount: '1', fee: '0' }),
    );
    await goals.updateOne(
      { _id: source },
      { $set: { hasCashyContributionHistory: true } },
    );
    const historyCount = await entries.countDocuments();
    await goalsService.remove(source, userId);
    await assert.rejects(() => goalsService.findOneOwned(source, userId));
    await assert.rejects(() =>
      goalsService.update(source, { name: 'Cannot restore' }, userId),
    );
    assert.ok(
      !(await goalsService.findAll({}, userId)).some(
        (goal) => goal.id === source,
      ),
    );
    assert.equal(await entries.countDocuments(), historyCount);
    const historical = await repository.findOne(userId, completed.id);
    assert.equal(historical.goals.source.deleted, true);
    assert.equal(historical.goals.source.name, 'Temporary cash diagnostic');
    assert.equal(
      (await repository.accept(userId, input)).record.id,
      completed.id,
    );
    await assert.rejects(() =>
      repository.accept(userId, intent({ amount: '1', fee: '0' })),
    );
    assert.equal(
      (await engine.execute(userId, pendingDeletion.record.id)).rejectionCode,
      'GOAL_UNAVAILABLE',
    );
    assert.equal(await entries.countDocuments(), historyCount);
  } finally {
    for (const name of created) {
      if (!name.startsWith(prefix)) {
        cleanupFailures.push(name);
        continue;
      }
      try {
        await connection.db?.dropCollection(name);
      } catch {
        cleanupFailures.push(name);
      }
    }
    await connection.close();
    if (cleanupFailures.length) {
      console.error(
        JSON.stringify({ temporaryCollectionsRequireCleanup: cleanupFailures }),
      );
      process.exitCode = 1;
    }
  }
  if (cleanupFailures.length) throw new Error('Cash probe cleanup failed.');
}
