import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatabaseService } from '../common/services/database.service';
import { GoalsService } from '../goals/goals.service';
import {
  CreateGoalMovementDto,
  FindGoalMovementsQueryDto,
  UpdateGoalMovementDto,
} from './dto/goals-movements.dto';
import {
  GoalMovement,
  GoalMovementDocument,
} from './entity/goals-movements.entity';
import { IGoalMovementResponse } from './interfaces/goals-movements.interface';

@Injectable()
export class GoalsMovementsService {
  constructor(
    @InjectModel(GoalMovement.name)
    private readonly movementModel: Model<GoalMovementDocument>,
    private readonly databaseService: DatabaseService,
    private readonly goalsService: GoalsService,
  ) {}

  async create(
    dto: CreateGoalMovementDto,
    userId: string,
  ): Promise<IGoalMovementResponse> {
    await this.goalsService.findOneOwned(dto.goalId, userId);
    const movement = await this.databaseService.create(this.movementModel, {
      ...dto,
      goalId: new Types.ObjectId(dto.goalId),
      userId,
      movementDate: dto.movementDate ? new Date(dto.movementDate) : new Date(),
      exchangeRateArsPerUsd: dto.exchangeRateArsPerUsd ?? null,
      platform: dto.platform ?? null,
      notes: dto.notes ?? null,
    });
    return this.mapToResponse(movement);
  }

  async findAll(
    query: FindGoalMovementsQueryDto,
    userId: string,
  ): Promise<IGoalMovementResponse[]> {
    const movements = await this.databaseService.findAll(
      this.movementModel,
      this.buildFilter(query, userId),
      {
        limit: query.limit,
        skip: query.skip,
        sort: { movementDate: -1, createdAt: -1 },
      },
    );
    return movements.map((movement) => this.mapToResponse(movement));
  }

  async findOne(id: string, userId: string): Promise<IGoalMovementResponse> {
    return this.mapToResponse(
      await this.databaseService.findOneOrFail(this.movementModel, {
        _id: id,
        userId,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateGoalMovementDto,
    userId: string,
  ): Promise<IGoalMovementResponse> {
    const movement = await this.databaseService.updateOneOrFail(
      this.movementModel,
      { _id: id, userId },
      {
        ...dto,
        ...(dto.movementDate
          ? { movementDate: new Date(dto.movementDate) }
          : {}),
        ...(dto.exchangeRateArsPerUsd !== undefined
          ? { exchangeRateArsPerUsd: dto.exchangeRateArsPerUsd ?? null }
          : {}),
        ...(dto.platform !== undefined
          ? { platform: dto.platform ?? null }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      },
    );
    return this.mapToResponse(movement);
  }

  async remove(id: string, userId: string): Promise<IGoalMovementResponse> {
    return this.mapToResponse(
      await this.databaseService.deleteOneOrFail(this.movementModel, {
        _id: id,
        userId,
      }),
    );
  }

  async findByGoal(goalId: string): Promise<GoalMovementDocument[]> {
    return this.databaseService.findAll(
      this.movementModel,
      { goalId: new Types.ObjectId(goalId) },
      { sort: { movementDate: 1, createdAt: 1 } },
    );
  }

  private buildFilter(
    query: FindGoalMovementsQueryDto,
    userId: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { userId };
    if (query.goalId) filter.goalId = new Types.ObjectId(query.goalId);
    if (query.type) filter.type = query.type;
    if (query.currency) filter.currency = query.currency;
    if (query.dateFrom || query.dateTo) {
      filter.movementDate = {
        ...(query.dateFrom ? { $gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { $lte: new Date(query.dateTo) } : {}),
      };
    }
    return filter;
  }

  private mapToResponse(movement: GoalMovementDocument): IGoalMovementResponse {
    return {
      id: movement._id.toString(),
      goalId: movement.goalId.toString(),
      userId: movement.userId,
      type: movement.type,
      amount: movement.amount,
      currency: movement.currency,
      movementDate: movement.movementDate.toISOString(),
      exchangeRateArsPerUsd: movement.exchangeRateArsPerUsd ?? null,
      platform: movement.platform ?? null,
      notes: movement.notes ?? null,
      createdAt: movement.createdAt.toISOString(),
      updatedAt: movement.updatedAt.toISOString(),
    };
  }
}
