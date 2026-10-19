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
import {
  CryptoTransferEntrySchema,
  type CryptoTransferEntryDocument,
} from './entity/crypto-transfer-entry.entity';
import { TransfersRepository } from './transfers.repository';
import { TransferExecutionService } from './transfer-execution.service';
import { CryptoTransfersService } from './crypto-transfers.service';
import type { TransferIntent } from './transfer.contracts';

export async function cryptoProbe(
  uri: string,
  databaseName: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Production crypto probe is disabled.');
  const prefix = `_growly_crypto_check_${randomUUID().replaceAll('-', '')}_`;
  const names = [
    'goals',
    'movements',
    'operations',
    'transfers',
    'cash',
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
    if (!db) throw new Error('Crypto probe database unavailable.');
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
      'CryptoProbeMovement',
      GoalMovementSchema.clone(),
      names[1],
    );
    const operations = connection.model<InvestmentOperationDocument>(
      'CryptoProbeOperation',
      InvestmentOperationSchema.clone(),
      names[2],
    );
    const transfers = connection.model<TransferDocument>(
      'CryptoProbeTransfer',
      TransferSchema.clone(),
      names[3],
    );
    const cash = connection.model<TransferEntryDocument>(
      'CryptoProbeCash',
      TransferEntrySchema.clone(),
      names[4],
    );
    const entries = connection.model<CryptoTransferEntryDocument>(
      'CryptoProbeEntry',
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
      cash,
      entries,
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
    const engine = new CryptoTransfersService(
      execution,
      entries,
      goals,
      operations,
    );
    const source = '111111111111111111111111',
      destination = '222222222222222222222222',
      raceSource = '333333333333333333333333',
      unidentified = '444444444444444444444444';
    const userId = 'crypto-probe-fixture';
    for (const id of [source, destination, raceSource, unidentified])
      await goals.create({
        _id: new Types.ObjectId(id),
        userId,
        name: 'Temporary crypto diagnostic',
        type: 'short_term',
        targetAmount: 1000000,
        currency: 'USD',
        status: 'active',
        trackingMode:
          id === destination ? 'from_scratch' : 'existing_portfolio',
        startDate: new Date('2020-01-01T00:00:00Z'),
        openingPositions:
          id === destination
            ? []
            : id === unidentified
              ? [
                  {
                    platform: 'NEXO',
                    ticker: 'BTC',
                    quantity: 1,
                    unitPrice: 50000,
                    totalAmount: 50000,
                    currency: 'USD',
                  },
                ]
              : [
                  {
                    platform: 'BINGX',
                    ticker: 'BTC',
                    assetId: 'crypto:bitcoin',
                    quantity: 1,
                    unitPrice: 50000,
                    totalAmount: 50000,
                    currency: 'USD',
                    exchangeRateArsPerUsd: 1000,
                  },
                  {
                    platform: 'NEXO',
                    ticker: 'USDT',
                    assetId: 'crypto:tether',
                    quantity: 100,
                    unitPrice: 1,
                    totalAmount: 100,
                    currency: 'USD',
                    exchangeRateArsPerUsd: 1000,
                  },
                  {
                    platform: 'NEXO',
                    ticker: 'SPY',
                    assetId: 'security:spy',
                    quantity: 10,
                    unitPrice: 500,
                    totalAmount: 5000,
                    currency: 'USD',
                    exchangeRateArsPerUsd: 1000,
                  },
                ],
      });
    const intent = (
      overrides: Partial<Extract<TransferIntent, { kind: 'crypto' }>> = {},
    ): TransferIntent => ({
      kind: 'crypto',
      assetId: 'crypto:tether',
      quantity: '25',
      fee: '1',
      notes: 'Temporary diagnostic',
      idempotencyKey: randomUUID(),
      source: { goalId: source, platform: 'NEXO' },
      destination: { goalId: destination, platform: 'BINGX' },
      ...overrides,
    });
    const input = intent();
    const accepted = await repository.accept(userId, input);
    const completed = await engine.execute(userId, accepted.record.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.bookValue?.delivered.usd, '25.00000000');
    assert.equal(completed.bookValue?.delivered.ars, '25000.00000000');
    assert.equal(completed.bookValue?.commission.usd, '1.00000000');
    assert.equal(await entries.countDocuments({ transferId: completed.id }), 3);
    await Promise.all([
      engine.execute(userId, completed.id),
      engine.execute(userId, completed.id),
    ]);
    assert.equal(await entries.countDocuments({ transferId: completed.id }), 3);
    assert.equal(
      (await repository.accept(userId, input)).record.id,
      completed.id,
    );
    const outgoing = await entries.findOne({
      transferId: completed.id,
      kind: 'asset_out',
    });
    const incoming = await entries.findOne({
      transferId: completed.id,
      kind: 'asset_in',
    });
    assert.equal(
      JSON.stringify(outgoing?.bookValue),
      JSON.stringify(incoming?.bookValue),
    );
    for (const target of [
      { goalId: source, platform: 'BINGX' },
      { goalId: destination, platform: 'NEXO' },
    ]) {
      const next = await repository.accept(
        userId,
        intent({ quantity: '5', fee: '0', destination: target }),
      );
      assert.equal(
        (await engine.execute(userId, next.record.id)).status,
        'completed',
      );
    }
    const wrongSource = await repository.accept(
      userId,
      intent({
        source: { goalId: source, platform: 'IOL' },
        quantity: '1',
        fee: '0',
      }),
    );
    assert.equal(
      (await engine.execute(userId, wrongSource.record.id)).rejectionCode,
      'SOURCE_POSITION_MISSING',
    );
    await assert.rejects(() =>
      repository.accept(
        userId,
        intent({ assetId: 'security:spy', quantity: '1', fee: '0' }),
      ),
    );
    const unknown = await repository.accept(
      userId,
      intent({
        assetId: 'crypto:bitcoin',
        source: { goalId: unidentified, platform: 'NEXO' },
        quantity: '0.1',
        fee: '0',
      }),
    );
    assert.equal(
      (await engine.execute(userId, unknown.record.id)).rejectionCode,
      'ASSET_NOT_TRANSFERABLE',
    );
    assert.equal(
      await entries.countDocuments({ transferId: unknown.record.id }),
      0,
    );
    await goals.updateOne(
      { _id: unidentified },
      { $set: { 'openingPositions.0.assetId': 'crypto:bitcoin' } },
    );
    const identified = await repository.accept(
      userId,
      intent({
        assetId: 'crypto:bitcoin',
        source: { goalId: unidentified, platform: 'NEXO' },
        quantity: '0.1',
        fee: '0',
      }),
    );
    const identifiedResult = await engine.execute(userId, identified.record.id);
    assert.equal(identifiedResult.status, 'completed');
    assert.equal(
      identifiedResult.bookValue?.delivered.hasUnconvertedAmounts,
      true,
    );
    assert.equal(identifiedResult.bookValue?.delivered.ars, '0.00000000');
    const btc = await repository.accept(
      userId,
      intent({
        assetId: 'crypto:bitcoin',
        source: { goalId: source, platform: 'BINGX' },
        destination: { goalId: destination, platform: 'NEXO' },
        quantity: '0.2',
        fee: '0.01',
      }),
    );
    const btcResult = await engine.execute(userId, btc.record.id);
    assert.equal(btcResult.status, 'completed');
    assert.equal(btcResult.bookValue?.delivered.usd, '10000.00000000');
    assert.equal(btcResult.bookValue?.commission.usd, '500.00000000');
    const oneTooMany = await repository.accept(
      userId,
      intent({
        assetId: 'crypto:bitcoin',
        source: { goalId: source, platform: 'BINGX' },
        quantity: '0.79',
        fee: '0.00000001',
      }),
    );
    assert.equal(
      (await engine.execute(userId, oneTooMany.record.id)).rejectionCode,
      'INSUFFICIENT_BALANCE',
    );
    const race = await Promise.all([
      repository.accept(
        userId,
        intent({
          assetId: 'crypto:bitcoin',
          source: { goalId: raceSource, platform: 'BINGX' },
          quantity: '0.8',
          fee: '0',
        }),
      ),
      repository.accept(
        userId,
        intent({
          assetId: 'crypto:bitcoin',
          source: { goalId: raceSource, platform: 'BINGX' },
          quantity: '0.8',
          fee: '0',
        }),
      ),
    ]);
    const results = await Promise.all(
      race.map((row) => engine.execute(userId, row.record.id)),
    );
    assert.equal(results.filter((row) => row.status === 'completed').length, 1);
    assert.equal(results.filter((row) => row.status === 'rejected').length, 1);
    const snapshot = await entries.countDocuments();
    const pending = await repository.accept(
      userId,
      intent({ quantity: '1', fee: '0' }),
    );
    const failingLedger = new PortfolioLedgerService(
      movements,
      operations,
      goalsService,
      cash,
      entries,
    );
    let validations = 0;
    failingLedger.validate = () => {
      validations++;
      return validations === 3
        ? Promise.reject(new Error('Injected post-insert failure'))
        : Promise.resolve();
    };
    const failing = new CryptoTransfersService(
      new TransferExecutionService(
        coordinator,
        repository,
        failingLedger,
        transfers,
        goals,
      ),
      entries,
      goals,
      operations,
    );
    await assert.rejects(() => failing.execute(userId, pending.record.id));
    assert.equal(await entries.countDocuments(), snapshot);
    assert.equal(
      (await repository.findOne(userId, pending.record.id)).status,
      'pending',
    );
    assert.equal(
      (await engine.execute(userId, pending.record.id)).status,
      'completed',
    );
    await assert.rejects(() => repository.findOne('other-user', completed.id));
    await assert.rejects(() =>
      ledger.validate(source, userId, {
        source: 'operation',
        id: 'new',
        type: 'buy',
        ticker: 'BTC',
        quantity: 1,
        totalAmount: 1,
        currency: 'USD',
        platform: 'BINGX',
        date: new Date('2021-01-01'),
      }),
    );
    assert.equal(await movements.countDocuments(), 0);
    assert.equal(await operations.countDocuments(), 0);
    assert.equal(await cash.countDocuments(), 0);
    assert.equal(
      await goals.countDocuments({ hasCashyContributionHistory: true }),
      0,
    );
    for (const id of [source, destination, raceSource, unidentified])
      await ledger.validate(id, userId);
    const pendingDeletion = await repository.accept(
      userId,
      intent({ quantity: '1', fee: '0' }),
    );
    const historyCount = await entries.countDocuments();
    await goalsService.remove(source, userId);
    await assert.rejects(() => goalsService.findOneOwned(source, userId));
    assert.ok(
      !(await goalsService.findAll({}, userId)).some(
        (goal) => goal.id === source,
      ),
    );
    assert.equal(await entries.countDocuments(), historyCount);
    const historical = await repository.findOne(userId, completed.id);
    assert.equal(historical.goals.source.deleted, true);
    assert.equal(historical.goals.source.name, 'Temporary crypto diagnostic');
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
  if (cleanupFailures.length) throw new Error('Crypto probe cleanup failed.');
}
