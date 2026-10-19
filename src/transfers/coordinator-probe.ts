import assert from 'node:assert/strict';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createConnection, Schema, Types } from 'mongoose';
import { LedgerCoordinator } from '../common/services/ledger-coordinator.service';
import { transactionSessionForGoals } from '../common/services/ledger-context';
import { GoalSchema, type GoalDocument } from '../goals/entity/goals.entity';

interface ProbeHeader {
  _id: string;
  status: string;
}
interface ProbeEntry {
  _id: string;
  transferId: string;
  amount: number;
}
class ExpectedRollback extends Error {}

export async function coordinatorProbe(
  uri: string,
  databaseName: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Production coordinator probe is disabled.');
  const prefix = `_growly_coordinator_check_${randomUUID().replaceAll('-', '')}_`;
  const names = ['goals', 'headers', 'entries'].map(
    (suffix) => prefix + suffix,
  );
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
    if (!db) throw new Error('Coordinator probe database unavailable.');
    for (const name of names) {
      await db.createCollection(name);
      created.push(name);
    }
    const goals = connection.model<GoalDocument>(
      'CoordinatorProbeGoal',
      GoalSchema.clone(),
      names[0],
    );
    const headers = connection.model<ProbeHeader>(
      'CoordinatorProbeHeader',
      new Schema({ _id: String, status: String }, { versionKey: false }),
      names[1],
    );
    const entries = connection.model<ProbeEntry>(
      'CoordinatorProbeEntry',
      new Schema(
        { _id: String, transferId: String, amount: Number },
        { versionKey: false },
      ),
      names[2],
    );
    const source = '111111111111111111111111';
    const destination = '222222222222222222222222';
    const userId = 'coordinator-probe-fixture';
    for (const id of [source, destination]) {
      await goals.create({
        _id: new Types.ObjectId(id),
        userId,
        name: 'Temporary diagnostic',
        type: 'short_term',
        targetAmount: 100000,
        currency: 'ARS',
        status: 'active',
        trackingMode: 'from_scratch',
        ledgerVersion: 0,
      });
    }
    await entries.create([
      { _id: source, transferId: 'balance', amount: 100000 },
      { _id: destination, transferId: 'balance', amount: 0 },
    ]);
    const coordinator = new LedgerCoordinator(connection, goals);
    await coordinator.runMany([destination, source], userId, async () => {
      const session = transactionSessionForGoals(userId, [source, destination]);
      await coordinator.run(source, userId, () =>
        Promise.resolve(
          assert.equal(transactionSessionForGoals(userId, [source]), session),
        ),
      );
      await entries.updateOne(
        { _id: source },
        { $inc: { amount: -25000 } },
        { session },
      );
      await entries.updateOne(
        { _id: destination },
        { $inc: { amount: 25000 } },
        { session },
      );
      await headers.create([{ _id: 'committed', status: 'completed' }], {
        session,
      });
      await entries.create(
        [
          { _id: 'debit', transferId: 'committed', amount: -25000 },
          { _id: 'credit', transferId: 'committed', amount: 25000 },
        ],
        { session, ordered: true },
      );
    });
    const balance = async (id: string): Promise<number | undefined> =>
      (await entries.findById(id))?.amount;
    assert.equal(await balance(source), 75000);
    assert.equal(await balance(destination), 25000);
    assert.equal(await headers.countDocuments(), 1);
    assert.equal(await entries.countDocuments(), 4);
    await assert.rejects(
      () =>
        coordinator.runMany([source, destination], userId, async () => {
          const session = transactionSessionForGoals(userId, [
            source,
            destination,
          ]);
          await entries.updateOne(
            { _id: source },
            { $inc: { amount: -5000 } },
            { session },
          );
          await headers.create([{ _id: 'rolled-back', status: 'completed' }], {
            session,
          });
          await entries.create(
            [
              {
                _id: 'rolled-back-debit',
                transferId: 'rolled-back',
                amount: -5000,
              },
            ],
            { session },
          );
          throw new ExpectedRollback();
        }),
      ExpectedRollback,
    );
    assert.equal(await balance(source), 75000);
    assert.equal(await balance(destination), 25000);
    assert.equal(await headers.countDocuments(), 1);
    assert.equal(await entries.countDocuments(), 4);
    assert.equal((await goals.findById(source))?.ledgerVersion, 1);
    assert.equal((await goals.findById(destination))?.ledgerVersion, 1);
    await goals.updateOne(
      { _id: destination },
      { $set: { cashyAdjustmentLock: 'pending-correction' } },
    );
    await assert.rejects(
      () =>
        coordinator.runMany([source, destination], userId, () =>
          Promise.reject(new Error('Blocked callback must not execute.')),
        ),
      (error: unknown) =>
        error instanceof ConflictException && error.getStatus() === 409,
    );
    assert.equal((await goals.findById(source))?.ledgerVersion, 1);
    await goals.updateOne(
      { _id: destination },
      { $unset: { cashyAdjustmentLock: '' } },
    );
    await Promise.all([
      coordinator.runMany([source, destination], userId, () =>
        Promise.resolve(true),
      ),
      coordinator.runMany([destination, source], userId, () =>
        Promise.resolve(true),
      ),
    ]);
    assert.equal((await goals.findById(source))?.ledgerVersion, 3);
    assert.equal((await goals.findById(destination))?.ledgerVersion, 3);
    await coordinator.runMany([source, source], userId, () =>
      Promise.resolve(true),
    );
    assert.equal((await goals.findById(source))?.ledgerVersion, 4);
    assert.equal((await goals.findById(destination))?.ledgerVersion, 3);
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
  if (cleanupFailures.length)
    throw new Error('Coordinator probe cleanup failed.');
}
