import { MongoClient, ObjectId, type Db, type ClientSession } from 'mongodb';
import { assetForTicker } from './asset-catalog';
import { planAssetIdentification, type AssetReference } from './migration-plan';

interface MigrationGoal {
  _id: ObjectId;
  userId: string;
  cashyAdjustmentLock?: string | null;
  openingPositions?: AssetReference[];
}

interface MigrationOperation extends AssetReference {
  _id: ObjectId;
  goalId: ObjectId;
  userId: string;
}

interface MigrationReport {
  mode: 'dry-run' | 'apply';
  goals: number;
  lockedGoals: number;
  conflictingGoals: number;
  identified: number;
  unknown: number;
  proposed: Record<string, number>;
  applied: number;
  financialValuesChanged: false;
}

export async function processGoal(
  db: Db,
  goalId: ObjectId,
  userId: string,
  apply: boolean,
  confirmed: ReadonlySet<string>,
  session?: ClientSession,
): Promise<Omit<MigrationReport, 'mode' | 'financialValuesChanged'>> {
  const report = {
    goals: 0,
    lockedGoals: 0,
    conflictingGoals: 0,
    identified: 0,
    unknown: 0,
    proposed: {} as Record<string, number>,
    applied: 0,
  };
  const goals = db.collection<MigrationGoal>('goals');
  const operations = db.collection<MigrationOperation>('investment_operations');
  const goal = await goals.findOne(
    { _id: goalId, userId },
    {
      session,
      projection: {
        _id: 1,
        userId: 1,
        cashyAdjustmentLock: 1,
        'openingPositions.ticker': 1,
        'openingPositions.assetId': 1,
      },
    },
  );
  if (!goal) return report;
  report.goals = 1;
  if (goal.cashyAdjustmentLock) {
    report.lockedGoals = 1;
    return report;
  }
  const rows = await operations
    .find(
      { goalId, userId },
      {
        session,
        projection: { _id: 1, goalId: 1, userId: 1, ticker: 1, assetId: 1 },
      },
    )
    .toArray();
  const positions = (goal.openingPositions ?? []).map(planAssetIdentification);
  const decisions = rows.map(planAssetIdentification);
  const all = [...positions, ...decisions];
  for (const decision of all) {
    if (decision.status === 'proposed')
      report.proposed[decision.ticker] =
        (report.proposed[decision.ticker] ?? 0) + 1;
    if (decision.status === 'identified') report.identified++;
    if (decision.status === 'unknown') report.unknown++;
  }
  if (all.some((decision) => decision.status === 'conflict')) {
    report.conflictingGoals = 1;
    return report;
  }
  const selected = all.filter(
    (decision) =>
      decision.status === 'proposed' && confirmed.has(decision.ticker),
  );
  if (!apply || !selected.length) return report;
  if (!session?.inTransaction()) throw new Error('TRANSACTION_REQUIRED');
  const openingUpdates: Record<string, string> = {};
  positions.forEach((decision, index) => {
    if (decision.status === 'proposed' && confirmed.has(decision.ticker))
      openingUpdates[`openingPositions.${index}.assetId`] = decision.assetId;
  });
  const lock = await goals.updateOne(
    { _id: goalId, userId, cashyAdjustmentLock: { $in: [null, ''] } },
    {
      $inc: { ledgerVersion: 1 },
      ...(Object.keys(openingUpdates).length ? { $set: openingUpdates } : {}),
    },
    { session },
  );
  if (lock.matchedCount !== 1) throw new Error('GOAL_UNAVAILABLE');
  for (const [index, decision] of decisions.entries()) {
    if (decision.status !== 'proposed' || !confirmed.has(decision.ticker))
      continue;
    const update = await operations.updateOne(
      { _id: rows[index]._id, goalId, userId, assetId: { $in: [null, ''] } },
      { $set: { assetId: decision.assetId } },
      { session },
    );
    if (update.modifiedCount !== 1) throw new Error('ASSET_CHANGED');
  }
  report.applied = selected.length;
  return report;
}

function option(name: string): string {
  const prefix = `--${name}=`;
  return (
    process.argv
      .slice(2)
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length) ?? ''
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const userId = option('user-id');
  const symbols = option('confirm-symbols').split(',').filter(Boolean);
  const confirmed = new Set(symbols);
  if (!userId || userId.length > 200 || !process.env.MONGO_URI)
    throw new Error('USER_AND_DATABASE_REQUIRED');
  if (
    apply &&
    (process.env.NODE_ENV === 'production' ||
      !symbols.length ||
      symbols.some(
        (symbol) =>
          !assetForTicker(symbol) || symbol !== symbol.trim().toUpperCase(),
      ))
  )
    throw new Error('EXPLICIT_SYMBOL_CONFIRMATION_REQUIRED');
  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });
  try {
    await client.connect();
    const db = client.db();
    const report: MigrationReport = {
      mode: apply ? 'apply' : 'dry-run',
      goals: 0,
      lockedGoals: 0,
      conflictingGoals: 0,
      identified: 0,
      unknown: 0,
      proposed: {},
      applied: 0,
      financialValuesChanged: false,
    };
    const cursor = db
      .collection<MigrationGoal>('goals')
      .find({ userId }, { projection: { _id: 1 } });
    for await (const goal of cursor) {
      const session = client.startSession();
      try {
        const result = apply
          ? await session.withTransaction(
              () => processGoal(db, goal._id, userId, true, confirmed, session),
              {
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' },
              },
            )
          : await processGoal(db, goal._id, userId, false, confirmed);
        for (const key of [
          'goals',
          'lockedGoals',
          'conflictingGoals',
          'identified',
          'unknown',
          'applied',
        ] as const)
          report[key] += result[key];
        for (const [ticker, count] of Object.entries(result.proposed))
          report.proposed[ticker] = (report.proposed[ticker] ?? 0) + count;
      } finally {
        await session.endSession();
      }
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close();
  }
}

if (require.main === module)
  void main().catch((error: unknown) => {
    const known = [
      'USER_AND_DATABASE_REQUIRED',
      'EXPLICIT_SYMBOL_CONFIRMATION_REQUIRED',
      'TRANSACTION_REQUIRED',
      'GOAL_UNAVAILABLE',
      'ASSET_CHANGED',
    ];
    console.error(
      JSON.stringify({
        ok: false,
        code:
          error instanceof Error && known.includes(error.message)
            ? error.message
            : 'ASSET_MIGRATION_FAILED',
        message:
          'La migración se detuvo. Los objetivos ya confirmados se conservan; podés reintentar sin duplicar. No se modifican importes. Revisá conexión, permisos y transacciones sin exponer credenciales.',
      }),
    );
    process.exitCode = 1;
  });
