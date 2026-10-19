import type { Model } from 'mongoose';
import type { GoalDocument } from './entity/goals.entity';
import { ledgerSession } from '../common/services/ledger-context';

export interface GoalReference {
  id: string;
  name: string;
  deleted: boolean;
}

export function unavailableGoal(id: string): GoalReference {
  return { id, name: 'Objetivo no disponible', deleted: true };
}

export async function goalReferences(
  model: Model<GoalDocument>,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, GoalReference>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const goals = await model
    .find({ userId, _id: { $in: unique } })
    .select({ _id: 1, name: 1, deletedAt: 1 })
    .session(ledgerSession())
    .exec();
  const references = new Map(unique.map((id) => [id, unavailableGoal(id)]));
  for (const goal of goals) {
    const id = goal._id.toString();
    references.set(id, {
      id,
      name: goal.name,
      deleted: Boolean(goal.deletedAt),
    });
  }
  return references;
}
