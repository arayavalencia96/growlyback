import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DatabaseService } from '../common/services/database.service';
import { GoalsService } from '../goals/goals.service';
import {
  CreateInvestmentOperationDto,
  FindInvestmentOperationsQueryDto,
  UpdateInvestmentOperationDto,
} from './dto/investment-operations.dto';
import {
  InvestmentOperation,
  InvestmentOperationDocument,
} from './entity/investment-operations.entity';
import { IInvestmentOperationResponse } from './interfaces/investment-operations.interface';

interface ILedgerOperation {
  id: string;
  platform: string;
  ticker: string;
  type: 'buy' | 'sell';
  quantity: number;
  operationDate: Date;
}

@Injectable()
export class InvestmentOperationsService {
  constructor(
    @InjectModel(InvestmentOperation.name)
    private readonly operationModel: Model<InvestmentOperationDocument>,
    private readonly databaseService: DatabaseService,
    private readonly goalsService: GoalsService,
  ) {}

  async create(
    dto: CreateInvestmentOperationDto,
    userId: string,
  ): Promise<IInvestmentOperationResponse> {
    await this.goalsService.findOneOwned(dto.goalId, userId);
    const payload = this.buildPayload(dto);
    await this.assertValidLedger(dto.goalId, userId, { id: 'new', ...payload });
    const operation = await this.databaseService.create(this.operationModel, {
      ...payload,
      goalId: new Types.ObjectId(dto.goalId),
      userId,
    });
    return this.mapToResponse(operation);
  }

  async findAll(
    query: FindInvestmentOperationsQueryDto,
    userId: string,
  ): Promise<IInvestmentOperationResponse[]> {
    const operations = await this.databaseService.findAll(
      this.operationModel,
      this.buildFilter(query, userId),
      {
        limit: query.limit,
        skip: query.skip,
        sort: { operationDate: -1, createdAt: -1 },
      },
    );
    return operations.map((operation) => this.mapToResponse(operation));
  }

  async findOne(
    id: string,
    userId: string,
  ): Promise<IInvestmentOperationResponse> {
    return this.mapToResponse(
      await this.databaseService.findOneOrFail(this.operationModel, {
        _id: id,
        userId,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdateInvestmentOperationDto,
    userId: string,
  ): Promise<IInvestmentOperationResponse> {
    const current = await this.databaseService.findOneOrFail(
      this.operationModel,
      { _id: id, userId },
    );
    const payload = this.buildPayload({
      goalId: current.goalId.toString(),
      platform: dto.platform ?? current.platform,
      ticker: dto.ticker ?? current.ticker,
      type: dto.type ?? current.type,
      operationDate: dto.operationDate ?? current.operationDate.toISOString(),
      quantity: dto.quantity ?? current.quantity,
      unitPrice: dto.unitPrice ?? current.unitPrice,
      totalAmount: dto.totalAmount ?? current.totalAmount ?? current.netAmount,
      currency: dto.currency ?? current.currency,
      exchangeRateArsPerUsd:
        dto.exchangeRateArsPerUsd === undefined
          ? current.exchangeRateArsPerUsd
          : dto.exchangeRateArsPerUsd,
      notes: dto.notes === undefined ? current.notes : dto.notes,
    });
    await this.assertValidLedger(
      current.goalId.toString(),
      userId,
      { id, ...payload },
      id,
    );
    return this.mapToResponse(
      await this.databaseService.updateOneOrFail(
        this.operationModel,
        { _id: id, userId },
        payload,
      ),
    );
  }

  async remove(
    id: string,
    userId: string,
  ): Promise<IInvestmentOperationResponse> {
    const current = await this.databaseService.findOneOrFail(
      this.operationModel,
      { _id: id, userId },
    );
    await this.assertValidLedger(
      current.goalId.toString(),
      userId,
      undefined,
      id,
    );
    return this.mapToResponse(
      await this.databaseService.deleteOneOrFail(this.operationModel, {
        _id: id,
        userId,
      }),
    );
  }

  async findByGoal(
    goalId: string,
    userId: string,
  ): Promise<InvestmentOperationDocument[]> {
    return this.databaseService.findAll(
      this.operationModel,
      { goalId: new Types.ObjectId(goalId), userId },
      { sort: { operationDate: 1, createdAt: 1 } },
    );
  }

  private buildPayload(dto: CreateInvestmentOperationDto) {
    const quantity = dto.quantity;
    const unitPrice = dto.unitPrice;
    const grossAmount = this.round(quantity * unitPrice);
    const totalAmount = this.round(dto.totalAmount);
    const fees = this.round(
      Math.max(
        0,
        dto.type === 'buy'
          ? totalAmount - grossAmount
          : grossAmount - totalAmount,
      ),
    );
    return {
      platform: dto.platform.trim().toUpperCase(),
      ticker: dto.ticker.trim().toUpperCase(),
      type: dto.type,
      operationDate: dto.operationDate
        ? new Date(dto.operationDate)
        : new Date(),
      quantity,
      unitPrice,
      totalAmount,
      fees,
      grossAmount,
      netAmount: totalAmount,
      currency: dto.currency,
      exchangeRateArsPerUsd: dto.exchangeRateArsPerUsd ?? null,
      notes: dto.notes ?? null,
    };
  }

  private async assertValidLedger(
    goalId: string,
    userId: string,
    candidate?: ILedgerOperation,
    excludedId?: string,
  ): Promise<void> {
    const documents = await this.findByGoal(goalId, userId);
    const operations: ILedgerOperation[] = documents
      .filter((item) => item._id.toString() !== excludedId)
      .map((item) => ({
        id: item._id.toString(),
        platform: item.platform,
        ticker: item.ticker,
        type: item.type,
        quantity: item.quantity,
        operationDate: item.operationDate,
      }));
    if (candidate) operations.push(candidate);
    operations.sort(
      (a, b) =>
        a.operationDate.getTime() - b.operationDate.getTime() ||
        a.id.localeCompare(b.id),
    );
    const positions = new Map<string, number>();
    for (const operation of operations) {
      const key = `${operation.platform}:${operation.ticker}`;
      const quantity =
        (positions.get(key) ?? 0) +
        (operation.type === 'buy' ? operation.quantity : -operation.quantity);
      if (quantity < -0.00000001)
        throw new BadRequestException(
          `Insufficient position for ${operation.ticker} on ${operation.platform}`,
        );
      positions.set(key, this.round(quantity));
    }
  }

  private buildFilter(
    query: FindInvestmentOperationsQueryDto,
    userId: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = { userId };
    if (query.goalId) filter.goalId = new Types.ObjectId(query.goalId);
    if (query.platform) filter.platform = query.platform.trim().toUpperCase();
    if (query.ticker) filter.ticker = query.ticker.trim().toUpperCase();
    if (query.type) filter.type = query.type;
    if (query.currency) filter.currency = query.currency;
    if (query.dateFrom || query.dateTo)
      filter.operationDate = {
        ...(query.dateFrom ? { $gte: new Date(query.dateFrom) } : {}),
        ...(query.dateTo ? { $lte: new Date(query.dateTo) } : {}),
      };
    return filter;
  }

  private mapToResponse(
    operation: InvestmentOperationDocument,
  ): IInvestmentOperationResponse {
    return {
      id: operation._id.toString(),
      goalId: operation.goalId.toString(),
      userId: operation.userId,
      platform: operation.platform,
      ticker: operation.ticker,
      type: operation.type,
      operationDate: operation.operationDate.toISOString(),
      quantity: operation.quantity,
      unitPrice: operation.unitPrice,
      totalAmount: operation.totalAmount ?? operation.netAmount,
      currency: operation.currency,
      exchangeRateArsPerUsd: operation.exchangeRateArsPerUsd ?? null,
      notes: operation.notes ?? null,
      createdAt: operation.createdAt.toISOString(),
      updatedAt: operation.updatedAt.toISOString(),
    };
  }

  private round(value: number): number {
    return Number(value.toFixed(8));
  }
}
