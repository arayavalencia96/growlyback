import {
  BadGatewayException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import { GoalsService } from '../goals/goals.service';
import { unavailableGoal, type GoalReference } from '../goals/goal-references';
import { PortfolioLedgerService } from '../portfolio-ledger.service';
import {
  GoalMovement,
  type GoalMovementDocument,
} from '../goals-movements/entity/goals-movements.entity';
import { AccountLinkService } from './account-link.service';
import {
  ContributionJob,
  type ContributionJobDocument,
  type ContributionJobStatus,
} from './contribution-job.entity';
import {
  ContributionPreview,
  type ContributionPreviewDocument,
} from './contribution-preview.entity';
import { ContributionConfirmDto } from './contribution-confirm.dto';
import { IntegrationConfig } from './integration.config';
import { contributionPeriod } from './contribution-money';
import { LedgerCoordinator } from '../common/services/ledger-coordinator.service';
import {
  ledgerSession,
  transactionSession,
} from '../common/services/ledger-context';
import type {
  ContributionLookup,
  ReserveContributionInput,
} from './contribution.contracts';

export interface ContributionJobView {
  goal: GoalReference;
  platform: string;
  movementDate: string;
  notes: string;
  originalAmountMinor: number;
  originalAllocationAmountMinor: number;
  revision: number;
  exchangeRateArsPerUsd: number;
  id: string;
  status: ContributionJobStatus;
  goalId: string;
  movementId: string;
  amountMinor: number;
  currency: 'ARS' | 'USD';
  allocationAmountMinor: number;
  period: string;
  message: string;
}

@Injectable()
export class ContributionJobService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private retrying = false;
  private readonly logger = new Logger(ContributionJobService.name);
  constructor(
    private readonly coordinator: LedgerCoordinator,
    @InjectModel(ContributionJob.name)
    private readonly jobs: Model<ContributionJobDocument>,
    @InjectModel(ContributionPreview.name)
    private readonly previews: Model<ContributionPreviewDocument>,
    @InjectModel(GoalMovement.name)
    private readonly movements: Model<GoalMovementDocument>,
    private readonly links: AccountLinkService,
    private readonly goals: GoalsService,
    private readonly ledger: PortfolioLedgerService,
    private readonly config: IntegrationConfig,
  ) {}

  private async view(job: ContributionJob): Promise<ContributionJobView> {
    const references = await this.goals.references([job.goalId], job.userId);
    return this.viewWithGoal(
      job,
      references.get(job.goalId) ?? unavailableGoal(job.goalId),
    );
  }

  private viewWithGoal(
    job: ContributionJob,
    goal: GoalReference,
  ): ContributionJobView {
    return {
      goal,
      platform: job.snapshot.platform,
      movementDate: job.snapshot.movementDate,
      notes: job.notes,
      originalAmountMinor: job.snapshot.amountMinor,
      originalAllocationAmountMinor: job.snapshot.allocationAmountMinor,
      revision: job.revision ?? 1,
      exchangeRateArsPerUsd:
        job.effective?.exchangeRateArsPerUsd ??
        job.snapshot.exchangeRateArsPerUsd,
      id: job._id,
      status: job.status,
      goalId: job.goalId,
      movementId: job.movementId,
      amountMinor: job.effective?.amountMinor ?? job.snapshot.amountMinor,
      currency: job.snapshot.currency,
      allocationAmountMinor:
        job.effective?.allocationAmountMinor ??
        job.snapshot.allocationAmountMinor,
      period: job.snapshot.period,
      message: job.message,
    };
  }

  async confirm(
    dto: ContributionConfirmDto,
    user: IAuthenticatedUser,
  ): Promise<ContributionJobView> {
    this.config.assertEnabled();
    let job = await this.jobs
      .findOne({ _id: dto.previewId, userId: user.userId })
      .lean()
      .exec();
    if (!job) {
      const prepared = await this.previews
        .findOne({ _id: dto.previewId, userId: user.userId })
        .lean()
        .exec();
      if (
        !prepared ||
        Date.parse(prepared.snapshot.expiresAt) <= Date.now() ||
        prepared.snapshot.period !== contributionPeriod()
      )
        throw new ConflictException(
          'La preparación venció. Volvé a validar el aporte.',
        );
      await this.goals.findOneOwned(prepared.snapshot.goalId, user.userId);
      const movementId = new Types.ObjectId().toString();
      await this.ledger.validate(prepared.snapshot.goalId, user.userId, {
        source: 'movement',
        id: movementId,
        type: 'contribution',
        amount: prepared.snapshot.amountMinor / 100,
        currency: prepared.snapshot.currency,
        platform: prepared.snapshot.platform,
        date: new Date(prepared.snapshot.movementDate),
      });
      await this.goals.protectCashyContributionHistory(
        prepared.snapshot.goalId,
        user.userId,
      );
      try {
        job = await this.jobs
          .findOneAndUpdate(
            { _id: dto.previewId },
            {
              $setOnInsert: {
                userId: user.userId,
                goalId: prepared.snapshot.goalId,
                movementId,
                snapshot: prepared.snapshot,
                notes: dto.notes ?? '',
                valuationExchangeRateArsPerUsd:
                  dto.valuationExchangeRateArsPerUsd,
                status: 'pending',
                attempts: 0,
                nextAttemptAt: new Date(),
                message: 'Confirmación en proceso.',
              },
            },
            {
              upsert: true,
              returnDocument: 'after',
              runValidators: true,
              writeConcern: { w: 'majority' },
            },
          )
          .lean()
          .exec();
      } catch {
        job = await this.jobs
          .findOne({ _id: dto.previewId, userId: user.userId })
          .lean()
          .exec();
        if (!job)
          throw new ConflictException(
            'No se pudo aceptar el aporte. Reintentá con la misma preparación.',
          );
      }
    }
    if (!job || job.userId !== user.userId)
      throw new NotFoundException('Aporte no encontrado.');
    void this.drive(job).catch(() => {
      this.logger.warn(
        'No se pudo completar el aporte; la recuperación sigue pendiente.',
      );
    });
    return this.view(job);
  }

  async cancelPending(
    id: string,
    userId: string,
  ): Promise<ContributionJobView> {
    this.config.assertEnabled();
    await this.jobs
      .updateOne(
        { _id: id, userId, status: 'pending' },
        { $set: { cancelRequested: true, nextAttemptAt: new Date() } },
      )
      .exec();
    const job = await this.jobs.findOne({ _id: id, userId }).lean().exec();
    if (!job) throw new NotFoundException('Aporte no encontrado.');
    await this.drive(job);
    return this.get(id, userId);
  }

  async reconcile(id: string, userId: string): Promise<ContributionJobView> {
    this.config.assertEnabled();
    await this.jobs
      .updateOne(
        { _id: id, userId, status: 'reconciliation-required' },
        { $set: { status: 'pending', nextAttemptAt: new Date() } },
      )
      .exec();
    const job = await this.jobs.findOne({ _id: id, userId }).lean().exec();
    if (!job) throw new NotFoundException('Aporte no encontrado.');
    await this.drive(job);
    return this.get(id, userId);
  }

  async get(id: string, userId: string): Promise<ContributionJobView> {
    const job = await this.jobs.findOne({ _id: id, userId }).lean().exec();
    if (!job) throw new NotFoundException('Aporte no encontrado.');
    return this.view(job);
  }
  async list(goalId: string, userId: string): Promise<ContributionJobView[]> {
    const rows = await this.jobs
      .find({ goalId, userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();
    if (!rows.length) return [];
    const references = await this.goals.references([goalId], userId);
    const goal = references.get(goalId) ?? unavailableGoal(goalId);
    return rows.map((row) => this.viewWithGoal(row, goal));
  }
  private input(job: ContributionJob): ReserveContributionInput {
    const p = job.snapshot;
    return {
      id: job._id,
      growlyUserId: job.userId,
      growlyMovementId: job.movementId,
      linkId: p.linkId,
      allocationId: p.allocationId,
      period: p.period,
      currency: p.currency,
      amountMinor: p.amountMinor,
      allocationAmountMinor: p.allocationAmountMinor,
      exchangeRateArsPerUsd: p.exchangeRateArsPerUsd,
      validUntil: p.expiresAt,
    };
  }
  private validReceipt(
    job: ContributionJob,
    receipt: ContributionLookup,
  ): void {
    if (
      receipt.id !== job._id ||
      (receipt.status !== 'missing' &&
        (receipt.allocationId !== job.snapshot.allocationId ||
          receipt.allocationAmountMinor !==
            job.snapshot.allocationAmountMinor ||
          receipt.growlyMovementId !== job.movementId))
    )
      throw new BadGatewayException('Respuesta de aporte incompatible.');
  }

  private async drive(job: ContributionJob): Promise<void> {
    if (job.status !== 'pending') return;
    const input = this.input(job);
    const actor = {
      id: job._id,
      growlyUserId: job.userId,
      linkId: job.snapshot.linkId,
    };
    let committed = false;
    try {
      let receipt = await this.links.contributionRequest('status', actor);
      this.validReceipt(job, receipt);
      if (receipt.status === 'missing') {
        if (
          job.cancelRequested ||
          Date.parse(job.snapshot.expiresAt) <= Date.now() ||
          job.snapshot.period !== contributionPeriod()
        )
          receipt = await this.links.contributionRequest('cancel', input);
        else {
          try {
            await this.links.authorize(
              { userId: job.userId },
              job.snapshot.linkId,
              'contributions:write',
            );
            receipt = await this.links.contributionRequest('reserve', input);
          } catch (error) {
            if (
              !(error instanceof HttpException) ||
              ![400, 403, 409, 410].includes(error.getStatus())
            )
              throw error;
            receipt = await this.links.contributionRequest('cancel', input);
          }
        }
      }
      this.validReceipt(job, receipt);
      if (receipt.status === 'reserved') {
        const latest = await this.jobs
          .findOne({ _id: job._id, userId: job.userId })
          .lean()
          .exec();
        if (latest?.cancelRequested)
          receipt = await this.links.contributionRequest('cancel', input);
      }
      if (receipt.status === 'reserved') {
        try {
          await this.links.authorize(
            { userId: job.userId },
            job.snapshot.linkId,
            'contributions:write',
          );
          receipt = await this.links.contributionRequest('confirm', actor);
        } catch (error) {
          if (
            !(error instanceof HttpException) ||
            ![400, 403, 409, 410].includes(error.getStatus())
          )
            throw error;
          receipt = await this.links.contributionRequest('cancel', input);
        }
      }
      this.validReceipt(job, receipt);
      if (receipt.status === 'cancelled') {
        await this.complete(
          job,
          'cancelled',
          receipt.reason ||
            'El aporte no pudo confirmarse. Volvé a validar con el disponible actual.',
        );
        return;
      }
      if (receipt.status !== 'confirmed')
        throw new BadGatewayException(
          'No se pudo determinar el estado del aporte.',
        );
      committed = true;
      await this.publish(job);
      await this.complete(
        job,
        'confirmed',
        'Aporte registrado y presupuesto actualizado.',
      );
    } catch (error) {
      if (
        committed &&
        error instanceof HttpException &&
        error.getStatus() < 500
      ) {
        await this.complete(
          job,
          'reconciliation-required',
          'Cashy confirmó el consumo, pero el objetivo requiere revisión antes de publicar el movimiento.',
        );
        return;
      }
      await this.jobs
        .updateOne(
          { _id: job._id, status: 'pending' },
          {
            $set: {
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(60000, 5000 * 2 ** Math.min(job.attempts, 4)),
              ),
              message:
                'Operación pendiente. Se reintentará automáticamente; no registres otro aporte por este mismo dinero.',
            },
            $inc: { attempts: 1 },
          },
        )
        .exec();
    }
  }

  private async publish(job: ContributionJob): Promise<void> {
    return this.coordinator.settleAccepted(job.goalId, job.userId, () =>
      this.publishUnlocked(job),
    );
  }

  private async publishUnlocked(job: ContributionJob): Promise<void> {
    const latest = await this.jobs
      .findOne({ _id: job._id, userId: job.userId })
      .session(ledgerSession())
      .lean()
      .exec();
    if (!latest || latest.status !== 'pending') return;
    const p = job.snapshot;
    await this.goals.findOneOwned(job.goalId, job.userId);
    await this.ledger.validate(
      job.goalId,
      job.userId,
      {
        source: 'movement',
        id: job.movementId,
        type: 'contribution',
        amount: p.amountMinor / 100,
        currency: p.currency,
        platform: p.platform,
        date: new Date(p.movementDate),
      },
      { source: 'movement', id: job.movementId },
    );
    const movement = await this.movements
      .findOneAndUpdate(
        { _id: new Types.ObjectId(job.movementId) },
        {
          $setOnInsert: {
            goalId: new Types.ObjectId(job.goalId),
            userId: job.userId,
            type: 'contribution',
            fundingSource: 'cashy',
            amount: p.amountMinor / 100,
            currency: p.currency,
            movementDate: new Date(p.movementDate),
            platform: p.platform,
            notes: job.notes || null,
            exchangeRateArsPerUsd:
              p.currency === 'USD'
                ? p.exchangeRateArsPerUsd
                : (job.valuationExchangeRateArsPerUsd ?? null),
            cashyContribution: {
              id: job._id,
              linkId: p.linkId,
              allocationId: p.allocationId,
              period: p.period,
              allocationAmountMinor: p.allocationAmountMinor,
              exchangeRateArsPerUsd: p.exchangeRateArsPerUsd,
            },
          },
        },
        {
          upsert: true,
          returnDocument: 'after',
          runValidators: true,
          session: ledgerSession(),
        },
      )
      .exec();
    if (
      !movement ||
      movement.userId !== job.userId ||
      movement.goalId.toString() !== job.goalId ||
      movement.cashyContribution?.id !== job._id
    )
      throw new ConflictException('El movimiento requiere revisión.');
    await this.jobs
      .updateOne(
        { _id: job._id, status: 'pending' },
        {
          $set: {
            status: 'confirmed',
            message: 'Aporte registrado y presupuesto actualizado.',
          },
        },
        { session: transactionSession() },
      )
      .exec();
  }
  private async complete(
    job: ContributionJob,
    status: ContributionJobStatus,
    message: string,
  ): Promise<void> {
    await this.jobs
      .updateOne(
        { _id: job._id, status: 'pending' },
        { $set: { status, message } },
        { writeConcern: { w: 'majority' } },
      )
      .exec();
  }
  onModuleInit(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(() => void this.retryPending(), 60000);
    this.timer.unref();
    void this.retryPending();
  }
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
  async retryPending(): Promise<void> {
    if (this.retrying || !this.config.enabled) return;
    this.retrying = true;
    try {
      const jobs = await this.jobs
        .find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
        .sort({ nextAttemptAt: 1 })
        .limit(20)
        .lean()
        .exec();
      for (const job of jobs) await this.drive(job);
    } catch {
      this.logger.warn(
        'No se pudo recuperar los aportes pendientes; se reintentará.',
      );
    } finally {
      this.retrying = false;
    }
  }
}
