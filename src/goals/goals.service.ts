import { BadRequestException, Injectable } from '@nestjs/common';
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
    this.validateOpeningState(createGoalDto);
    const goal = await this.databaseService.create(this.goalModel, {
      ...createGoalDto,
      userId,
      startDate: createGoalDto.startDate
        ? new Date(createGoalDto.startDate)
        : new Date(),
      endDate: createGoalDto.endDate ? new Date(createGoalDto.endDate) : null,
      status: createGoalDto.status ?? 'active',
      openingCashBalances: (createGoalDto.openingCashBalances ?? []).map(
        (balance) => ({
          ...balance,
          platform: balance.platform.trim().toUpperCase(),
          exchangeRateArsPerUsd: balance.exchangeRateArsPerUsd ?? null,
        }),
      ),
      openingPositions: (createGoalDto.openingPositions ?? []).map(
        (position) => ({
          ...position,
          platform: position.platform.trim().toUpperCase(),
          ticker: position.ticker.trim().toUpperCase(),
          exchangeRateArsPerUsd: position.exchangeRateArsPerUsd ?? null,
        }),
      ),
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
      trackingMode: goal.trackingMode ?? 'legacy',
      openingCashBalances: (goal.openingCashBalances ?? []).map((balance) => ({
        platform: balance.platform,
        currency: balance.currency,
        amount: balance.amount,
        exchangeRateArsPerUsd: balance.exchangeRateArsPerUsd ?? null,
      })),
      openingPositions: (goal.openingPositions ?? []).map((position) => ({
        platform: position.platform,
        ticker: position.ticker,
        quantity: position.quantity,
        unitPrice: position.unitPrice,
        totalAmount: position.totalAmount,
        currency: position.currency,
        exchangeRateArsPerUsd: position.exchangeRateArsPerUsd ?? null,
      })),
      notes: goal.notes ?? null,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
    };
  }

  private validateOpeningState(dto: CreateGoalDto): void {
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    if (dto.endDate && new Date(dto.endDate) < startDate)
      throw new BadRequestException(
        'Goal end date cannot be earlier than its start date',
      );

    const cash = dto.openingCashBalances ?? [];
    const positions = dto.openingPositions ?? [];
    if (
      dto.trackingMode === 'from_scratch' &&
      (cash.length || positions.length)
    )
      throw new BadRequestException(
        'A from-scratch goal cannot contain opening balances or positions',
      );
    if (
      dto.trackingMode === 'existing_portfolio' &&
      !cash.length &&
      !positions.length
    )
      throw new BadRequestException(
        'An existing portfolio requires an opening balance or position',
      );

    const cashKeys = cash.map(
      (item) => `${item.platform.trim().toUpperCase()}:${item.currency}`,
    );
    if (new Set(cashKeys).size !== cashKeys.length)
      throw new BadRequestException('Opening cash balances must be unique');

    const positionKeys = positions.map(
      (item) =>
        `${item.platform.trim().toUpperCase()}:${item.ticker.trim().toUpperCase()}`,
    );
    if (new Set(positionKeys).size !== positionKeys.length)
      throw new BadRequestException('Opening positions must be unique');
  }
}
