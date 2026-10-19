import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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

import { ledgerSession } from './common/services/ledger-context';
import { moneyUnits } from './transfers/cash-projection';
import {
  CryptoTransferEntry,
  type CryptoTransferEntryDocument,
} from './transfers/entity/crypto-transfer-entry.entity';
import {
  TransferEntry,
  type TransferEntryDocument,
} from './transfers/entity/transfer-entry.entity';

@Injectable()
export class PortfolioLedgerService {
  constructor(
    @InjectModel(GoalMovement.name)
    private readonly movementModel: Model<GoalMovementDocument>,
    @InjectModel(InvestmentOperation.name)
    private readonly operationModel: Model<InvestmentOperationDocument>,
    private readonly goalsService: GoalsService,
    @InjectModel(TransferEntry.name)
    private readonly transferEntries: Model<TransferEntryDocument>,
    @InjectModel(CryptoTransferEntry.name)
    private readonly cryptoEntries: Model<CryptoTransferEntryDocument>,
  ) {}

  async validate(
    goalId: string,
    userId: string,
    candidate?: PortfolioLedgerCandidate,
    excluded?: { source: PortfolioLedgerCandidate['source']; id: string },
    requireCashBalance = false,
  ): Promise<void> {
    const goal = await this.goalsService.findOneOwned(goalId, userId);
    const movements = await this.movementModel
      .find({
        goalId: new Types.ObjectId(goalId),
        userId,
        voided: { $ne: true },
      })
      .session(ledgerSession())
      .exec();
    const operations = await this.operationModel
      .find({ goalId: new Types.ObjectId(goalId), userId })
      .session(ledgerSession())
      .exec();
    const transfers = await this.transferEntries
      .find({ goalId, userId })
      .session(ledgerSession())
      .exec();
    const assets = await this.cryptoEntries
      .find({ goalId, userId })
      .session(ledgerSession())
      .exec();
    const cutoff = Math.max(
      ...[...transfers, ...assets].map((entry) => entry.effectiveAt.getTime()),
    );
    const removed =
      excluded?.source === 'movement'
        ? movements.find((item) => item._id.toString() === excluded.id)
            ?.movementDate
        : excluded?.source === 'operation'
          ? operations.find((item) => item._id.toString() === excluded.id)
              ?.operationDate
          : undefined;
    if (
      (candidate && candidate.date.getTime() <= cutoff) ||
      (removed && removed.getTime() <= cutoff)
    )
      throw new ConflictException(
        'No se puede modificar el historial previo a una transferencia: conserva sus saldos y costos contables.',
      );
    const events: PortfolioLedgerCandidate[] = [
      ...assets.map((item) => ({
        source: 'asset-transfer' as const,
        id: item._id,
        type: item.kind,
        quantityUnits: item.quantityUnits,
        quantityScale: item.quantityScale,
        ticker: item.ticker,
        platform: item.platform,
        date: item.effectiveAt,
      })),
      ...transfers.map((item) => ({
        source: 'transfer' as const,
        id: item._id,
        type: item.kind,
        amount: Number(item.amountUnits) / 100,
        currency: item.currency,
        platform: item.platform,
        date: item.effectiveAt,
      })),
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

    const positions = new Map<string, bigint>();
    for (const position of goal.openingPositions)
      positions.set(
        this.positionKey(position.platform, position.ticker),
        moneyUnits(position.quantity),
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
      if (event.source === 'operation' || event.source === 'asset-transfer') {
        const key = this.positionKey(event.platform, event.ticker);
        const quantity =
          event.source === 'operation'
            ? moneyUnits(event.quantity)
            : BigInt(event.quantityUnits) *
              10n ** BigInt(8 - event.quantityScale);
        const direction =
          event.type === 'buy' || event.type === 'asset_in' ? 1n : -1n;
        const next = (positions.get(key) ?? 0n) + direction * quantity;
        if (next < 0n)
          throw new BadRequestException({
            code: 'INSUFFICIENT_BALANCE',
            message: `Insufficient position for ${event.ticker} on ${event.platform}`,
          });
        positions.set(key, next);
      }
      if (event.source === 'asset-transfer') continue;
      if (
        goal.trackingMode === 'legacy' &&
        !requireCashBalance &&
        !transfers.length
      )
        continue;
      const key = this.cashKey(event.platform, event.currency);
      const delta =
        event.source === 'transfer'
          ? event.type === 'cash_in'
            ? event.amount
            : -event.amount
          : event.source === 'movement'
            ? event.type === 'contribution'
              ? event.amount
              : -event.amount
            : event.type === 'buy'
              ? -event.totalAmount
              : event.totalAmount;
      const next = this.round((cash.get(key) ?? 0) + delta);
      if (next < -0.00000001)
        throw new BadRequestException({
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient cash in ${event.currency} on ${event.platform}`,
        });
      cash.set(key, next);
    }
  }

  private priority(event: PortfolioLedgerCandidate): number {
    if (event.source === 'asset-transfer')
      return event.type === 'asset_in' ? 0 : 3;
    if (event.source === 'transfer') return event.type === 'cash_in' ? 0 : 3;
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
