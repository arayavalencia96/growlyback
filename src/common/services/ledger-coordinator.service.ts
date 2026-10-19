import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Goal, type GoalDocument } from '../../goals/entity/goals.entity';
import { ledgerContext, transactionSessionForGoals } from './ledger-context';

interface CoordinationOptions {
  requireActive: boolean;
  allowDeleted?: boolean;
  lockIds: ReadonlyMap<string, string>;
}

function normalizedGoalIds(goalIds: readonly string[]): string[] {
  if (
    !Array.isArray(goalIds) ||
    !goalIds.length ||
    goalIds.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
  )
    throw new BadRequestException(
      'Indicá objetivos válidos para la transacción.',
    );
  const ids = [
    ...new Set<string>(goalIds.map((id: string) => id.toLowerCase())),
  ].sort();
  if (ids.length > 2)
    throw new BadRequestException(
      'Una transferencia admite hasta dos objetivos.',
    );
  return ids;
}

@Injectable()
export class LedgerCoordinator {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
  ) {}

  async run<T>(
    goalId: string,
    userId: string,
    work: () => Promise<T>,
    lockId?: string,
  ): Promise<T> {
    const ids = normalizedGoalIds([goalId]);
    return this.coordinate(ids, userId, work, {
      requireActive: false,
      lockIds: new Map(lockId === undefined ? [] : [[ids[0], lockId]]),
    });
  }

  async runMany<T>(
    goalIds: readonly string[],
    userId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.coordinate(normalizedGoalIds(goalIds), userId, work, {
      requireActive: true,
      lockIds: new Map(),
    });
  }

  async settleAccepted<T>(
    goalId: string,
    userId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.coordinate(normalizedGoalIds([goalId]), userId, work, {
      requireActive: false,
      allowDeleted: true,
      lockIds: new Map(),
    });
  }

  private async coordinate<T>(
    goalIds: readonly string[],
    userId: string,
    work: () => Promise<T>,
    options: CoordinationOptions,
  ): Promise<T> {
    if (!userId)
      throw new BadRequestException('La transacción requiere un usuario.');
    const context = ledgerContext.getStore();
    if (context) {
      transactionSessionForGoals(userId, goalIds);
      if (options.allowDeleted && !context.allowDeleted)
        throw new ConflictException(
          'No se puede ampliar el acceso a objetivos eliminados dentro de una transacción.',
        );
      if (options.requireActive && !context.requireActive)
        throw new ConflictException(
          'La transacción actual no validó objetivos activos para una transferencia.',
        );
      for (const [id, lockId] of options.lockIds) {
        if (context.lockIds.get(id) !== lockId)
          throw new ConflictException(
            'No se puede cambiar el permiso de bloqueo dentro de una transacción.',
          );
      }
      return work();
    }
    // MongoDB puede reintentar el callback: no ejecutar efectos externos dentro de él.
    return this.connection.transaction(
      async (session) => {
        for (const goalId of goalIds) {
          const goal = await this.goals
            .findOneAndUpdate(
              {
                _id: goalId,
                userId,
                ...(!options.allowDeleted ? { deletedAt: null } : {}),
                cashyAdjustmentLock: options.lockIds.get(goalId) ?? {
                  $in: [null, ''],
                },
                ...(options.requireActive ? { status: 'active' } : {}),
              },
              { $inc: { ledgerVersion: 1 } },
              { session, returnDocument: 'after' },
            )
            .exec();
          if (!goal)
            throw new ConflictException({
              code: 'GOAL_UNAVAILABLE',
              message:
                'Objetivo no disponible: revisá su estado, titularidad y correcciones pendientes.',
            });
        }
        return ledgerContext.run(
          {
            session,
            goalIds,
            userId,
            lockIds: options.lockIds,
            requireActive: options.requireActive,
            allowDeleted: options.allowDeleted ?? false,
          },
          work,
        );
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  }
}
