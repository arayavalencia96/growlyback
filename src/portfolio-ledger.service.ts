import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GoalMovement,
  GoalMovementDocument,
} from './goals-movements/entity/goals-movements.entity';
import { GoalsService } from './goals/goals.service';
import {
  InvestmentOperation,
  InvestmentOperationDocument,
} from './investment-operations/entity/investment-operations.entity';
import type { PortfolioLedgerCandidate } from './portfolio-ledger.interface';

@Injectable()
export class PortfolioLedgerService {
  constructor(
    @InjectModel(GoalMovement.name)
    private readonly movementModel: Model<GoalMovementDocument>,
    @InjectModel(InvestmentOperation.name)
    private readonly operationModel: Model<InvestmentOperationDocument>,
    private readonly goalsService: GoalsService,
  ) {}

  async validate(
    goalId: string,
    userId: string,
    candidate?: PortfolioLedgerCandidate,
    excluded?: { source: PortfolioLedgerCandidate['source']; id: string },
  ): Promise<void> {
    const [goal, movements, operations] = await Promise.all([
      this.goalsService.findOneOwned(goalId, userId),
      this.movementModel.find({ goalId: new Types.ObjectId(goalId), userId }),
      this.operationModel.find({ goalId: new Types.ObjectId(goalId), userId }),
    ]);
    const events: PortfolioLedgerCandidate[] = [
      ...movements
        .filter(
          (item) =>
            excluded?.source !== 'movement' ||
            item._id.toString() !== excluded.id,
        )
        .map((item) => ({
          source: 'movement' as const,
          id: item._id.toString(),
          type: item.type,
          amount: item.amount,
          currency: item.currency,
          platform: this.normalizePlatform(item.platform),
          date: item.movementDate,
        })),
      ...operations
        .filter(
          (item) =>
            excluded?.source !== 'operation' ||
            item._id.toString() !== excluded.id,
        )
        .map((item) => ({
          source: 'operation' as const,
          id: item._id.toString(),
          type: item.type,
          platform: this.normalizePlatform(item.platform),
          ticker: item.ticker,
          quantity: item.quantity,
          totalAmount: item.totalAmount ?? item.netAmount,
          currency: item.currency,
          date: item.operationDate,
        })),
    ];
    if (candidate) events.push(candidate);
    events.sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        this.priority(a) - this.priority(b) ||
        a.id.localeCompare(b.id),
    );

    const positions = new Map<string, number>();
    for (const position of goal.openingPositions)
      positions.set(
        this.positionKey(position.platform, position.ticker),
        this.round(position.quantity),
      );
    const cash = new Map<string, number>();
    for (const balance of goal.openingCashBalances)
      cash.set(
        this.cashKey(balance.platform, balance.currency),
        this.round(balance.amount),
      );

    for (const event of events) {
      if (goal.trackingMode !== 'legacy') {
        if (event.date.getTime() < new Date(goal.startDate).getTime())
          throw new BadRequestException(
            'Ledger entry date cannot be earlier than the goal start date',
          );
        if (event.date.getTime() > Date.now())
          throw new BadRequestException(
            'Ledger entry date cannot be in the future',
          );
      }
      if (event.source === 'operation') {
        const key = this.positionKey(event.platform, event.ticker);
        const next =
          (positions.get(key) ?? 0) +
          (event.type === 'buy' ? event.quantity : -event.quantity);
        if (next < -0.00000001)
          throw new BadRequestException(
            `Insufficient position for ${event.ticker} on ${event.platform}`,
          );
        positions.set(key, this.round(next));
      }
      if (goal.trackingMode === 'legacy') continue;
      const key = this.cashKey(event.platform, event.currency);
      const delta =
        event.source === 'movement'
          ? event.type === 'contribution'
            ? event.amount
            : -event.amount
          : event.type === 'buy'
            ? -event.totalAmount
            : event.totalAmount;
      const next = this.round((cash.get(key) ?? 0) + delta);
      if (next < -0.00000001)
        throw new BadRequestException(
          `Insufficient cash in ${event.currency} on ${event.platform}`,
        );
      cash.set(key, next);
    }
  }

  private priority(event: PortfolioLedgerCandidate): number {
    if (event.source === 'movement')
      return event.type === 'contribution' ? 0 : 3;
    return event.type === 'buy' ? 1 : 2;
  }

  private normalizePlatform(value?: string | null): string {
    return value?.trim().toUpperCase() || 'GENERAL';
  }

  private cashKey(platform: string, currency: string): string {
    return `${this.normalizePlatform(platform)}:${currency}`;
  }

  private positionKey(platform: string, ticker: string): string {
    return `${this.normalizePlatform(platform)}:${ticker.trim().toUpperCase()}`;
  }

  private round(value: number): number {
    return Number(value.toFixed(8));
  }
}
