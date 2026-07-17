import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DatabaseService } from '../common/services/database.service';
import {
  CreateGoalDto,
  FindGoalsQueryDto,
  UpdateGoalDto,
} from './dto/goals.dto';
import { Goal, GoalDocument } from './entity/goals.entity';
import { IGoalResponse } from './interfaces/goals.interface';

@Injectable()
export class GoalsService {
  constructor(
    @InjectModel(Goal.name) private readonly goalModel: Model<GoalDocument>,
    private readonly databaseService: DatabaseService,
  ) {}

  async create(
    createGoalDto: CreateGoalDto,
    userId: string,
  ): Promise<IGoalResponse> {
    const goal = await this.databaseService.create(this.goalModel, {
      ...createGoalDto,
      userId,
      startDate: createGoalDto.startDate
        ? new Date(createGoalDto.startDate)
        : new Date(),
      endDate: createGoalDto.endDate ? new Date(createGoalDto.endDate) : null,
      status: createGoalDto.status ?? 'active',
      notes: createGoalDto.notes ?? null,
    });

    return this.mapToResponse(goal);
  }

  async findAll(
    query: FindGoalsQueryDto,
    userId: string,
  ): Promise<Array<IGoalResponse>> {
    const goals = await this.databaseService.findAll(
      this.goalModel,
      this.buildFilter(query, userId),
      {
        limit: query.limit,
        skip: query.skip,
        sort: { createdAt: -1 },
      },
    );

    return goals.map((goal) => this.mapToResponse(goal));
  }

  async findOne(id: string): Promise<IGoalResponse> {
    const goal = await this.databaseService.findByIdOrFail(this.goalModel, id);
    return this.mapToResponse(goal);
  }

  async findOneOwned(id: string, userId: string): Promise<IGoalResponse> {
    const goal = await this.databaseService.findOneOrFail(this.goalModel, {
      _id: id,
      userId,
    });
    return this.mapToResponse(goal);
  }

  async update(
    id: string,
    updateGoalDto: UpdateGoalDto,
    userId: string,
  ): Promise<IGoalResponse> {
    const goal = await this.databaseService.updateOneOrFail(
      this.goalModel,
      { _id: id, userId },
      {
        ...updateGoalDto,
        ...(updateGoalDto.startDate
          ? { startDate: new Date(updateGoalDto.startDate) }
          : {}),
        ...(updateGoalDto.endDate !== undefined
          ? {
              endDate: updateGoalDto.endDate
                ? new Date(updateGoalDto.endDate)
                : null,
            }
          : {}),
        ...(updateGoalDto.notes !== undefined
          ? { notes: updateGoalDto.notes ?? null }
          : {}),
      },
    );

    return this.mapToResponse(goal);
  }

  async remove(id: string, userId: string): Promise<IGoalResponse> {
    const goal = await this.databaseService.deleteOneOrFail(this.goalModel, {
      _id: id,
      userId,
    });
    return this.mapToResponse(goal);
  }

  private buildFilter(
    query: FindGoalsQueryDto,
    userId: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { userId };

    if (query.type) {
      filter.type = query.type;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.currency) {
      filter.currency = query.currency;
    }

    if (query.search) {
      const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escapedSearch, $options: 'i' } },
        { notes: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    return filter;
  }

  private mapToResponse(goal: GoalDocument): IGoalResponse {
    return {
      id: goal._id.toString(),
      userId: goal.userId,
      name: goal.name,
      type: goal.type,
      targetAmount: goal.targetAmount,
      currency: goal.currency,
      startDate: goal.startDate.toISOString(),
      endDate: goal.endDate ? goal.endDate.toISOString() : null,
      status: goal.status,
      notes: goal.notes ?? null,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    };
  }
}
