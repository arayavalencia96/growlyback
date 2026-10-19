import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { coordinatorProbe } from './coordinator-probe';
import { cashProbe } from './cash-probe';
import { cryptoProbe } from './crypto-probe';
import {
  MongoClient,
  MongoServerError,
  MongoServerSelectionError,
  type Db,
} from 'mongodb';

interface ProbeBalance {
  _id: string;
  balance: number;
}
interface ProbeTransfer {
  _id: string;
  status: string;
  userId: string;
  idempotencyKey: string;
}
interface ProbeEntry {
  _id: string;
  transferId: string;
  amount: number;
}
interface HelloResult {
  setName?: string;
  msg?: string;
  logicalSessionTimeoutMinutes?: number;
}

interface TransferIndexInfo {
  unique?: boolean;
  key: Record<string, unknown>;
  partialFilterExpression?: unknown;
  sparse?: boolean;
}

class ExpectedRollback extends Error {}

let stage = 'configuration';

function failureReason(error: unknown, depth = 0): string {
  if (depth > 5) return 'unknown';
  if (error instanceof MongoServerError && error.code === 18)
    return 'authentication-failed';
  if (error instanceof MongoServerSelectionError) {
    for (const server of error.reason?.servers.values() ?? []) {
      const reason = failureReason(server.error, depth + 1);
      if (reason !== 'unknown') return reason;
    }
    return 'server-unavailable-or-network-access-list';
  }
  if (error instanceof Error) {
    if (/certificate|self.signed|unable.to.verify|issuer/i.test(error.message))
      return 'tls-certificate';
    if (/ENOTFOUND|ESERVFAIL|querySrv|queryTxt/i.test(error.message))
      return 'dns-resolution';
    if (/ECONNREFUSED|ETIMEDOUT|ENETUNREACH/i.test(error.message))
      return 'network-unreachable';
    if (error.cause && error.cause !== error)
      return failureReason(error.cause, depth + 1);
  }
  return 'unknown';
}

function isLocal(uri: string): boolean {
  const authority =
    uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?([^/?]+)/)?.[1] ?? '';
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(authority);
}

async function writeProbe(client: MongoClient, db: Db): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Production write probe is disabled.');
  const prefix =
    '_growly_transfer_check_' + randomUUID().replaceAll('-', '') + '_';
  const names = ['balances', 'transfers', 'entries'].map(
    (suffix) => prefix + suffix,
  );
  const created: string[] = [];
  const balances = db.collection<ProbeBalance>(names[0]);
  const transfers = db.collection<ProbeTransfer>(names[1]);
  const entries = db.collection<ProbeEntry>(names[2]);
  let cleanupFailed = false;
  let failed = false;
  let failure: unknown;
  try {
    stage = 'probe-provisioning';
    for (const name of names) {
      await db.createCollection(name);
      created.push(name);
    }
    await transfers.createIndex(
      { userId: 1, idempotencyKey: 1 },
      { unique: true },
    );
    await balances.insertMany([
      { _id: 'source', balance: 100000 },
      { _id: 'destination', balance: 0 },
    ]);
    stage = 'probe-commit';
    await client.withSession(async (session) => {
      await session.withTransaction(
        async () => {
          await balances.updateOne(
            { _id: 'source' },
            { $inc: { balance: -25000 } },
            { session },
          );
          await balances.updateOne(
            { _id: 'destination' },
            { $inc: { balance: 25000 } },
            { session },
          );
          await transfers.insertOne(
            {
              _id: 'committed',
              status: 'completed',
              userId: 'fixture',
              idempotencyKey: 'committed',
            },
            { session },
          );
          await entries.insertMany(
            [
              { _id: 'debit', transferId: 'committed', amount: -25000 },
              { _id: 'credit', transferId: 'committed', amount: 25000 },
            ],
            { session },
          );
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          maxCommitTimeMS: 10000,
        },
      );
    });
    assert.equal((await balances.findOne({ _id: 'source' }))?.balance, 75000);
    assert.equal(
      (await balances.findOne({ _id: 'destination' }))?.balance,
      25000,
    );
    assert.equal(await transfers.countDocuments(), 1);
    assert.equal(await entries.countDocuments(), 2);
    stage = 'probe-idempotency';
    const attempts = await Promise.allSettled(
      ['race-a', 'race-b'].map((_id) =>
        transfers.insertOne({
          _id,
          status: 'pending',
          userId: 'fixture',
          idempotencyKey: 'same-key',
        }),
      ),
    );
    assert.equal(
      attempts.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    const rejected = attempts.find((result) => result.status === 'rejected');
    assert.ok(
      rejected?.status === 'rejected' &&
        rejected.reason instanceof MongoServerError &&
        rejected.reason.code === 11000,
    );
    assert.equal(
      await transfers.countDocuments({
        userId: 'fixture',
        idempotencyKey: 'same-key',
      }),
      1,
    );
    await transfers.insertOne({
      _id: 'other-user',
      status: 'pending',
      userId: 'other-fixture',
      idempotencyKey: 'same-key',
    });
    await transfers.deleteMany({
      idempotencyKey: 'same-key',
      userId: { $in: ['fixture', 'other-fixture'] },
    });
    stage = 'probe-rollback';
    await client.withSession(async (session) => {
      try {
        await session.withTransaction(
          async () => {
            await balances.updateOne(
              { _id: 'source' },
              { $inc: { balance: -5000 } },
              { session },
            );
            await balances.updateOne(
              { _id: 'destination' },
              { $inc: { balance: 5000 } },
              { session },
            );
            await transfers.insertOne(
              {
                _id: 'rolled-back',
                status: 'completed',
                userId: 'fixture',
                idempotencyKey: 'rolled-back',
              },
              { session },
            );
            await entries.insertMany(
              [
                {
                  _id: 'rollback-debit',
                  transferId: 'rolled-back',
                  amount: -5000,
                },
                {
                  _id: 'rollback-credit',
                  transferId: 'rolled-back',
                  amount: 5000,
                },
              ],
              { session },
            );
            throw new ExpectedRollback();
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            maxCommitTimeMS: 10000,
          },
        );
        throw new Error('Rollback did not occur.');
      } catch (error) {
        if (!(error instanceof ExpectedRollback)) throw error;
      }
    });
    assert.equal((await balances.findOne({ _id: 'source' }))?.balance, 75000);
    assert.equal(
      (await balances.findOne({ _id: 'destination' }))?.balance,
      25000,
    );
    assert.equal(await transfers.countDocuments(), 1);
    assert.equal(await entries.countDocuments(), 2);
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    for (const name of created) {
      if (!name.startsWith(prefix)) {
        cleanupFailed = true;
        continue;
      }
      try {
        await db.collection(name).drop();
      } catch (error) {
        if (!(error instanceof MongoServerError && error.code === 26))
          cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed) {
    stage = 'probe-cleanup';
    throw new Error('Probe collections require cleanup.');
  }
  if (failed) throw failure;
}

async function check(): Promise<void> {
  const uri = process.env.MONGO_URI;
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
    throw new Error('MONGO_URI is required.');
  const write = process.argv.includes('--write-probe');
  const probeCoordinator = process.argv.includes('--coordinator-probe');
  const probeCash = process.argv.includes('--cash-probe');
  const probeCrypto = process.argv.includes('--crypto-probe');
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    appName: 'growly-transfer-stage7-check',
  });
  try {
    stage = 'connection';
    await client.connect();
    const db = client.db();
    stage = 'topology';
    const hello = (await db.admin().command({ hello: 1 })) as HelloResult;
    stage = 'readonly-transaction';
    await client.withSession(async (session) => {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      try {
        const id = '_transfer_read_probe_' + randomUUID();
        for (const name of [
          'goals',
          'goal_movements',
          'investment_operations',
        ]) {
          await db
            .collection<{ _id: string }>(name)
            .findOne(
              { _id: id },
              { session, projection: { _id: 1 }, maxTimeMS: 5000 },
            );
        }
      } finally {
        if (session.inTransaction()) await session.abortTransaction();
      }
    });
    stage = 'transfer-indexes';
    const collectionExists = await db
      .listCollections({ name: 'transfers' }, { nameOnly: true })
      .hasNext();
    const indexes: TransferIndexInfo[] = collectionExists
      ? ((await db
          .collection('transfers')
          .listIndexes()
          .toArray()) as TransferIndexInfo[])
      : [];
    const uniqueIndexReady = indexes.some(
      (index) =>
        index.unique === true &&
        index.key.userId === 1 &&
        index.key.idempotencyKey === 1 &&
        Object.keys(index.key).length === 2 &&
        !index.partialFilterExpression &&
        !index.sparse,
    );
    if (write) await writeProbe(client, db);
    if (probeCoordinator) {
      stage = 'coordinator-probe';
      await coordinatorProbe(uri, db.databaseName);
    }
    if (probeCash) {
      stage = 'cash-probe';
      await cashProbe(uri, db.databaseName);
    }
    if (probeCrypto) {
      stage = 'crypto-probe';
      await cryptoProbe(uri, db.databaseName);
    }
    console.log(
      JSON.stringify({
        stage: 8,
        target: isLocal(uri) ? 'local' : 'remote',
        topology:
          hello.msg === 'isdbgrid'
            ? 'sharded'
            : hello.setName
              ? 'replica-set'
              : 'standalone',
        sessionsSupported:
          typeof hello.logicalSessionTimeoutMinutes === 'number',
        readonlyTransaction: 'passed',
        idempotencyIndex: uniqueIndexReady
          ? 'ready'
          : 'missing-start-backend-to-create',
        idempotencyConcurrencyProbe: write ? 'passed' : 'not-run',
        commit:
          write || probeCoordinator || probeCash || probeCrypto
            ? 'passed'
            : 'not-run',
        rollback:
          write || probeCoordinator || probeCash || probeCrypto
            ? 'passed'
            : 'not-run',
        cleanup:
          write || probeCoordinator || probeCash || probeCrypto
            ? 'passed'
            : 'not-required',
        financialCollectionsWritten: false,
        crossGoalCoordinatorImplemented: true,
        crossGoalCoordinatorProbe: probeCoordinator ? 'passed' : 'not-run',
        coordinatorProbeCleanup: probeCoordinator ? 'passed' : 'not-required',
        cashTransferProbe: probeCash ? 'passed' : 'not-run',
        cashTransferProbeCleanup: probeCash ? 'passed' : 'not-required',
        cryptoTransferProbe: probeCrypto ? 'passed' : 'not-run',
        cryptoTransferProbeCleanup: probeCrypto ? 'passed' : 'not-required',
      }),
    );
  } finally {
    await client.close();
  }
}

void check().catch((error) => {
  const code = error instanceof MongoServerError ? error.code : undefined;
  console.error(
    JSON.stringify({
      stage,
      reason: failureReason(error),
      ok: false,
      ...(code !== undefined ? { mongoCode: code } : {}),
      message:
        'No se pudo completar el diagnóstico. Revisá configuración, conectividad y permisos. No se imprimen credenciales.',
    }),
  );
  process.exitCode = 1;
});
