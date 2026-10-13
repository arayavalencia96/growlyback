import { ConflictException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Goal, type GoalDocument } from '../../goals/entity/goals.entity';
import { ledgerContext } from './ledger-context';

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
    const context = ledgerContext.getStore();
    if (context) {
      if (context.goalId !== goalId || context.userId !== userId)
        throw new ConflictException('La operación abarca otro objetivo.');
      return work();
    }
    return this.connection.transaction(
      async (session) => {
        const goal = await this.goals
          .findOneAndUpdate(
            {
              _id: goalId,
              userId,
              cashyAdjustmentLock: lockId ?? { $in: [null, ''] },
            },
            { $inc: { ledgerVersion: 1 } },
            { session, returnDocument: 'after' },
          )
          .exec();
        if (!goal)
          throw new ConflictException(
            'Objetivo no disponible: hay una corrección pendiente o no pertenece a tu cuenta.',
          );
        return ledgerContext.run({ session, goalId, userId }, work);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  }
}
