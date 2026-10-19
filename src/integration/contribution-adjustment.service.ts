import {
  BadGatewayException,
  BadRequestException,
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
import { Goal, type GoalDocument } from '../goals/entity/goals.entity';
import {
  GoalMovement,
  type GoalMovementDocument,
} from '../goals-movements/entity/goals-movements.entity';
import { PortfolioLedgerService } from '../portfolio-ledger.service';
import { LedgerCoordinator } from '../common/services/ledger-coordinator.service';
import { transactionSession } from '../common/services/ledger-context';
import { AccountLinkService } from './account-link.service';
import {
  ContributionJob,
  type ContributionJobDocument,
} from './contribution-job.entity';
import {
  ContributionAdjustment,
  type ContributionAdjustmentDocument,
} from './contribution-adjustment.entity';
import { ContributionAdjustmentDto } from './contribution-adjustment.dto';
import { contributionMoney } from './contribution-money';
import type {
  ContributionAdjustmentInput,
  ContributionAdjustmentReceipt,
} from './contribution-adjustment.contracts';
import { IntegrationConfig } from './integration.config';

export interface ContributionAdjustmentView {
  beforeAmountMinor: number;
  beforeAllocationAmountMinor: number;
  id: string;
  contributionId: string;
  kind: 'edit' | 'void';
  status: 'pending' | 'applied' | 'rejected';
  amountMinor: number;
  allocationAmountMinor: number;
  reason: string;
  message: string;
  createdAt: string;
}

@Injectable()
export class ContributionAdjustmentService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private retrying = false;
  private readonly logger = new Logger(ContributionAdjustmentService.name);
  constructor(
    @InjectModel(ContributionAdjustment.name)
    private readonly adjustments: Model<ContributionAdjustmentDocument>,
    @InjectModel(ContributionJob.name)
    private readonly jobs: Model<ContributionJobDocument>,
    @InjectModel(GoalMovement.name)
    private readonly movements: Model<GoalMovementDocument>,
    @InjectModel(Goal.name) private readonly goals: Model<GoalDocument>,
    private readonly coordinator: LedgerCoordinator,
    private readonly ledger: PortfolioLedgerService,
    private readonly links: AccountLinkService,
    private readonly config: IntegrationConfig,
  ) {}
  private view(row: ContributionAdjustment): ContributionAdjustmentView {
    return {
      beforeAmountMinor: row.before.amountMinor,
      beforeAllocationAmountMinor: row.before.allocationAmountMinor,
      id: row._id,
      contributionId: row.contributionId,
      kind: row.input.kind,
      status: row.status,
      amountMinor: row.input.amountMinor,
      allocationAmountMinor: row.input.allocationAmountMinor,
      reason: row.reason,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async list(
    contributionId: string,
    userId: string,
  ): Promise<ContributionAdjustmentView[]> {
    const rows = await this.adjustments
      .find({ contributionId, userId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return rows.map((row) => this.view(row));
  }
  async submit(
    contributionId: string,
    dto: ContributionAdjustmentDto,
    userId: string,
  ): Promise<ContributionAdjustmentView> {
    this.config.assertEnabled();
    if (!dto.reason.trim())
      throw new BadRequestException('Indicá el motivo de la corrección.');
    const previous = await this.adjustments
      .findOne({ _id: dto.id })
      .lean()
      .exec();
    if (previous) {
      if (
        previous.userId !== userId ||
        previous.contributionId !== contributionId
      )
        throw new NotFoundException('Corrección no encontrada.');
      const original = await this.jobs
        .findOne({ _id: contributionId, userId })
        .lean()
        .exec();
      if (!original) throw new NotFoundException('Aporte no encontrado.');
      const money =
        dto.kind === 'void'
          ? {
              amountMinor: 0,
              allocationAmountMinor: 0,
              exchangeRateArsPerUsd: previous.input.exchangeRateArsPerUsd,
            }
          : contributionMoney(
              dto.amount ?? 0,
              original.snapshot.currency,
              dto.exchangeRateArsPerUsd ?? previous.input.exchangeRateArsPerUsd,
            );
      if (
        previous.input.kind !== dto.kind ||
        previous.input.expectedRevision !== dto.expectedRevision ||
        previous.reason !== dto.reason.trim() ||
        previous.input.amountMinor !== money.amountMinor ||
        previous.input.allocationAmountMinor !== money.allocationAmountMinor ||
        previous.input.exchangeRateArsPerUsd !== money.exchangeRateArsPerUsd
      )
        throw new ConflictException(
          'La clave de corrección ya se usó con otros datos.',
        );
      await this.drive(previous);
      return this.get(dto.id, userId);
    }
    const original = await this.jobs
      .findOne({ _id: contributionId, userId })
      .lean()
      .exec();
    if (!original) throw new NotFoundException('Aporte no encontrado.');
    await this.links.authorize(
      { userId },
      original.snapshot.linkId,
      'contributions:write',
    );
    await this.coordinator.run(original.goalId, userId, async () => {
      const session = transactionSession();
      const job = await this.jobs
        .findOne({ _id: contributionId, userId })
        .session(session)
        .lean()
        .exec();
      if (
        !job ||
        !['confirmed', 'reconciliation-required'].includes(job.status) ||
        (job.revision ?? 1) !== dto.expectedRevision ||
        (job.status === 'reconciliation-required' && dto.kind !== 'void')
      )
        throw new ConflictException(
          'El aporte cambió. Actualizá su estado antes de corregirlo.',
        );
      const before = job.effective ?? {
        amountMinor: job.snapshot.amountMinor,
        allocationAmountMinor: job.snapshot.allocationAmountMinor,
        exchangeRateArsPerUsd: job.snapshot.exchangeRateArsPerUsd,
      };
      const money =
        dto.kind === 'void'
          ? {
              amountMinor: 0,
              allocationAmountMinor: 0,
              exchangeRateArsPerUsd: before.exchangeRateArsPerUsd,
            }
          : contributionMoney(
              dto.amount ?? 0,
              job.snapshot.currency,
              dto.exchangeRateArsPerUsd ?? before.exchangeRateArsPerUsd,
            );
      const movement = await this.movements
        .findOne({
          _id: job.movementId,
          userId,
          goalId: new Types.ObjectId(job.goalId),
        })
        .session(session)
        .exec();
      if (
        movement &&
        (movement.fundingSource !== 'cashy' ||
          movement.cashyContribution?.id !== job._id ||
          movement.voided)
      )
        throw new ConflictException('El movimiento requiere revisión.');
      if (!movement && job.status === 'confirmed')
        throw new ConflictException(
          'Falta el movimiento confirmado. Requiere revisión.',
        );
      if (movement || dto.kind === 'edit')
        await this.ledger.validate(
          job.goalId,
          userId,
          dto.kind === 'void'
            ? undefined
            : {
                source: 'movement',
                id: job.movementId,
                type: 'contribution',
                amount: money.amountMinor / 100,
                currency: job.snapshot.currency,
                platform: job.snapshot.platform,
                date: new Date(job.snapshot.movementDate),
              },
          { source: 'movement', id: job.movementId },
          money.amountMinor < before.amountMinor,
        );
      const input: ContributionAdjustmentInput = {
        id: dto.id,
        contributionId,
        growlyUserId: userId,
        linkId: job.snapshot.linkId,
        expectedRevision: dto.expectedRevision,
        kind: dto.kind,
        ...money,
      };
      await this.adjustments.create(
        [
          {
            _id: dto.id,
            userId,
            goalId: job.goalId,
            contributionId,
            input,
            before,
            reason: dto.reason.trim(),
            status: 'pending',
            attempts: 0,
            nextAttemptAt: new Date(),
            message:
              'Corrección pendiente; los movimientos del objetivo están temporalmente bloqueados.',
          },
        ],
        { session },
      );
      await this.goals
        .updateOne(
          { _id: job.goalId, userId },
          { $set: { cashyAdjustmentLock: dto.id } },
          { session },
        )
        .exec();
    });
    const row = await this.adjustments
      .findOne({ _id: dto.id, userId })
      .lean()
      .exec();
    if (!row) throw new NotFoundException('Corrección no encontrada.');
    await this.drive(row);
    return this.get(dto.id, userId);
  }
  private async get(
    id: string,
    userId: string,
  ): Promise<ContributionAdjustmentView> {
    const row = await this.adjustments
      .findOne({ _id: id, userId })
      .lean()
      .exec();
    if (!row) throw new NotFoundException('Corrección no encontrada.');
    return this.view(row);
  }
  private async drive(row: ContributionAdjustment): Promise<void> {
    if (row.status !== 'pending') return;
    const input = row.input;
    try {
      let receipt = await this.links.adjustmentRequest('adjustment-status', {
        id: input.id,
        contributionId: input.contributionId,
        growlyUserId: input.growlyUserId,
        linkId: input.linkId,
      });
      if (receipt.status === 'missing') {
        try {
          await this.links.authorize(
            { userId: row.userId },
            input.linkId,
            'contributions:write',
          );
          receipt = await this.links.adjustmentRequest('adjust', input);
        } catch (error) {
          if (!(error instanceof HttpException) || error.getStatus() !== 403)
            throw error;
          receipt = await this.links.adjustmentRequest(
            'adjustment-reject',
            input,
          );
        }
      }
      if (receipt.status === 'missing')
        throw new BadGatewayException(
          'No se pudo determinar el estado de la corrección.',
        );
      for (const key of Object.keys(
        input,
      ) as (keyof ContributionAdjustmentInput)[])
        if (receipt[key] !== input[key])
          throw new BadGatewayException(
            'Respuesta de corrección incompatible.',
          );
      if (
        receipt.status === 'applied' &&
        receipt.revision !== input.expectedRevision + 1
      )
        throw new BadGatewayException('Revisión de corrección incompatible.');
      await this.finish(row, receipt);
    } catch (error) {
      await this.adjustments
        .updateOne(
          { _id: row._id, status: 'pending' },
          {
            $set: {
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(60000, 5000 * 2 ** Math.min(row.attempts, 4)),
              ),
              message:
                error instanceof HttpException && error.getStatus() < 500
                  ? 'Se requiere revisión. El objetivo permanece bloqueado hasta determinar el estado en Cashy.'
                  : 'Esperando sincronización con Cashy. Se reintentará automáticamente.',
            },
            $inc: { attempts: 1 },
          },
        )
        .exec();
    }
  }
  private async finish(
    row: ContributionAdjustment,
    receipt: ContributionAdjustmentReceipt,
  ): Promise<void> {
    const current = await this.adjustments
      .findOne({ _id: row._id })
      .lean()
      .exec();
    if (!current || current.status !== 'pending') return;
    await this.coordinator.run(
      row.goalId,
      row.userId,
      async () => {
        const session = transactionSession();
        const current = await this.adjustments
          .findOne({ _id: row._id, status: 'pending' })
          .session(session)
          .lean()
          .exec();
        if (!current) return;
        const job = await this.jobs
          .findOne({ _id: row.contributionId, userId: row.userId })
          .session(session)
          .lean()
          .exec();
        if (!job || (job.revision ?? 1) !== row.input.expectedRevision)
          throw new ConflictException('Historial local incompatible.');
        if (receipt.status === 'applied') {
          const money = {
            amountMinor: row.input.amountMinor,
            allocationAmountMinor: row.input.allocationAmountMinor,
            exchangeRateArsPerUsd: row.input.exchangeRateArsPerUsd,
          };
          const movement = await this.movements
            .findOne({ _id: job.movementId, userId: row.userId })
            .session(session)
            .exec();
          if (movement) {
            if (movement.cashyContribution?.id !== job._id)
              throw new ConflictException('Movimiento incompatible.');
            if (row.input.kind === 'void')
              await this.movements
                .updateOne(
                  { _id: job.movementId, userId: row.userId },
                  { $set: { voided: true, voidedAt: new Date() } },
                  { session },
                )
                .exec();
            else
              await this.movements
                .updateOne(
                  { _id: job.movementId, userId: row.userId },
                  {
                    $set: {
                      amount: money.amountMinor / 100,
                      ...(job.snapshot.currency === 'USD'
                        ? { exchangeRateArsPerUsd: money.exchangeRateArsPerUsd }
                        : {}),
                      'cashyContribution.allocationAmountMinor':
                        money.allocationAmountMinor,
                      'cashyContribution.exchangeRateArsPerUsd':
                        money.exchangeRateArsPerUsd,
                    },
                  },
                  { session, runValidators: true },
                )
                .exec();
          } else if (row.input.kind !== 'void')
            throw new ConflictException('Falta el movimiento original.');
          await this.jobs
            .updateOne(
              { _id: job._id, userId: row.userId },
              {
                $set: {
                  effective: money,
                  revision: receipt.revision,
                  status: row.input.kind === 'void' ? 'voided' : 'confirmed',
                  message:
                    row.input.kind === 'void'
                      ? 'Aporte anulado: se restituyó el disponible del mes original.'
                      : 'Aporte corregido en Growly y Cashy.',
                },
              },
              { session },
            )
            .exec();
        }
        await this.adjustments
          .updateOne(
            { _id: row._id },
            {
              $set: {
                status: receipt.status,
                message:
                  receipt.status === 'applied'
                    ? 'Sincronización completada.'
                    : receipt.reason,
              },
            },
            { session },
          )
          .exec();
        await this.goals
          .updateOne(
            {
              _id: row.goalId,
              userId: row.userId,
              cashyAdjustmentLock: row._id,
            },
            { $unset: { cashyAdjustmentLock: 1 } },
            { session },
          )
          .exec();
      },
      row._id,
    );
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
      const rows = await this.adjustments
        .find({ status: 'pending', nextAttemptAt: { $lte: new Date() } })
        .sort({ nextAttemptAt: 1 })
        .limit(20)
        .lean()
        .exec();
      for (const row of rows) await this.drive(row);
    } catch {
      this.logger.warn('No se pudieron recuperar las correcciones pendientes.');
    } finally {
      this.retrying = false;
    }
  }
}
