import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatabaseService } from '../common/services/database.service';
import { GoalsService } from '../goals/goals.service';
import { PortfolioLedgerService } from '../portfolio-ledger.service';
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

import { LedgerCoordinator } from '../common/services/ledger-coordinator.service';

@Injectable()
export class GoalsMovementsService {
  constructor(
    private readonly coordinator: LedgerCoordinator,
    @InjectModel(GoalMovement.name)
    private readonly movementModel: Model<GoalMovementDocument>,
    private readonly databaseService: DatabaseService,
    private readonly goalsService: GoalsService,
    private readonly portfolioLedgerService: PortfolioLedgerService,
  ) {}

  async create(
    dto: CreateGoalMovementDto,
    userId: string,
  ): Promise<IGoalMovementResponse> {
    return this.coordinator.run(dto.goalId, userId, () =>
      this.createUnlocked(dto, userId),
    );
  }

  private async createUnlocked(
    dto: CreateGoalMovementDto,
    userId: string,
  ): Promise<IGoalMovementResponse> {
    await this.goalsService.findOneOwned(dto.goalId, userId);
    this.assertUnlinkedSource(dto);
    const payload = this.buildPayload(dto);
    await this.portfolioLedgerService.validate(dto.goalId, userId, {
      source: 'movement',
      id: 'new',
      platform: payload.platform,
      type: payload.type,
      amount: payload.amount,
      currency: payload.currency,
      date: payload.movementDate,
    });
    const movement = await this.databaseService.create(this.movementModel, {
      ...payload,
      goalId: new Types.ObjectId(dto.goalId),
      userId,
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
    const row = await this.databaseService.findOneOrFail(this.movementModel, {
      _id: id,
      userId,
    });
    return this.coordinator.run(row.goalId.toString(), userId, () =>
      this.updateUnlocked(id, dto, userId),
    );
  }

  private async updateUnlocked(
    id: string,
    dto: UpdateGoalMovementDto,
    userId: string,
  ): Promise<IGoalMovementResponse> {
    const current = await this.databaseService.findOneOrFail(
      this.movementModel,
      { _id: id, userId },
    );
    if (current.fundingSource === 'cashy')
      throw new ConflictException(
        'Los aportes vinculados requieren el flujo de corrección de Cashy. Usá el panel de aportes vinculados.',
      );
    this.assertUnlinkedSource({
      type: dto.type ?? current.type,
      fundingSource: dto.fundingSource,
    });
    if (
      (dto.type ?? current.type) === 'contribution' &&
      current.type === 'contribution' &&
      dto.fundingSource !== undefined &&
      dto.fundingSource !== (current.fundingSource ?? 'legacy')
    )
      throw new ConflictException(
        'No se puede cambiar el origen de un aporte existente en esta etapa.',
      );
    const payload = this.buildPayload({
      goalId: current.goalId.toString(),
      type: dto.type ?? current.type,
      amount: dto.amount ?? current.amount,
      currency: dto.currency ?? current.currency,
      movementDate: dto.movementDate ?? current.movementDate.toISOString(),
      exchangeRateArsPerUsd:
        dto.exchangeRateArsPerUsd === undefined
          ? current.exchangeRateArsPerUsd
          : dto.exchangeRateArsPerUsd,
      platform: dto.platform ?? current.platform ?? 'GENERAL',
      notes: dto.notes === undefined ? current.notes : dto.notes,
    });
    if (payload.type === 'contribution' && current.type === 'contribution')
      payload.fundingSource = current.fundingSource ?? 'legacy';
    await this.portfolioLedgerService.validate(
      current.goalId.toString(),
      userId,
      {
        source: 'movement',
        id,
        platform: payload.platform,
        type: payload.type,
        amount: payload.amount,
        currency: payload.currency,
        date: payload.movementDate,
      },
      { source: 'movement', id },
    );
    const withdrawalPayload = { ...payload };
    delete withdrawalPayload.fundingSource;
    const movement = await this.databaseService.updateOneOrFail(
      this.movementModel,
      { _id: id, userId },
      payload.type === 'withdrawal'
        ? {
            $set: withdrawalPayload,
            $unset: { fundingSource: 1 },
          }
        : payload,
    );
    return this.mapToResponse(movement);
  }

  async remove(id: string, userId: string): Promise<IGoalMovementResponse> {
    const row = await this.databaseService.findOneOrFail(this.movementModel, {
      _id: id,
      userId,
    });
    return this.coordinator.run(row.goalId.toString(), userId, () =>
      this.removeUnlocked(id, userId),
    );
  }

  private async removeUnlocked(
    id: string,
    userId: string,
  ): Promise<IGoalMovementResponse> {
    const current = await this.databaseService.findOneOrFail(
      this.movementModel,
      { _id: id, userId },
    );
    if (current.fundingSource === 'cashy')
      throw new ConflictException(
        'Los aportes vinculados requieren una anulación coordinada con Cashy. Usá el panel de aportes vinculados.',
      );
    await this.portfolioLedgerService.validate(
      current.goalId.toString(),
      userId,
      undefined,
      { source: 'movement', id },
    );
    return this.mapToResponse(
      await this.databaseService.deleteOneOrFail(this.movementModel, {
        _id: id,
        userId,
      }),
    );
  }

  private assertUnlinkedSource(
    dto: Pick<CreateGoalMovementDto, 'type' | 'fundingSource'>,
  ): void {
    if (dto.fundingSource === 'cashy')
      throw new ConflictException(
        'Los aportes de Cashy deben confirmarse mediante la integración, no por esta ruta.',
      );
    if (dto.type === 'withdrawal' && dto.fundingSource !== undefined)
      throw new BadRequestException(
        'Las extracciones no tienen un origen de aporte.',
      );
  }

  private buildPayload(dto: CreateGoalMovementDto): {
    type: CreateGoalMovementDto['type'];
    amount: number;
    currency: CreateGoalMovementDto['currency'];
    movementDate: Date;
    exchangeRateArsPerUsd: number | null;
    platform: string;
    notes: string | null;
    fundingSource?: GoalMovement['fundingSource'];
  } {
    return {
      type: dto.type,
      fundingSource:
        dto.type === 'contribution'
          ? (dto.fundingSource ?? 'external')
          : undefined,
      amount: dto.amount,
      currency: dto.currency,
      movementDate: dto.movementDate ? new Date(dto.movementDate) : new Date(),
      exchangeRateArsPerUsd: dto.exchangeRateArsPerUsd ?? null,
      platform: dto.platform?.trim().toUpperCase() || 'GENERAL',
      notes: dto.notes ?? null,
    };
  }

  async findByGoal(
    goalId: string,
    userId: string,
  ): Promise<GoalMovementDocument[]> {
    return this.databaseService.findAll(
      this.movementModel,
      { goalId: new Types.ObjectId(goalId), userId, voided: { $ne: true } },
      { sort: { movementDate: 1, createdAt: 1 } },
    );
  }

  private buildFilter(
    query: FindGoalMovementsQueryDto,
    userId: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { userId, voided: { $ne: true } };
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
      ...(movement.type === 'contribution'
        ? { fundingSource: movement.fundingSource ?? 'legacy' }
        : {}),
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
