import { randomUUID } from 'node:crypto';
import { currentRecordDay } from '../common/services/record-date';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import { GoalsService } from '../goals/goals.service';
import { AccountLinkService } from './account-link.service';
import {
  contributionDate,
  contributionMoney,
  contributionPeriod,
} from './contribution-money';
import { ContributionPreviewDto } from './contribution-preview.dto';
import {
  ContributionPreview,
  type ContributionPreviewDocument,
} from './contribution-preview.entity';
import type { CashyContributionPreview } from './contribution-preview.contracts';

@Injectable()
export class ContributionPreviewService {
  constructor(
    @InjectModel(ContributionPreview.name)
    private readonly previews: Model<ContributionPreviewDocument>,
    private readonly goals: GoalsService,
    private readonly links: AccountLinkService,
  ) {}

  async prepare(
    dto: ContributionPreviewDto,
    user: IAuthenticatedUser,
  ): Promise<CashyContributionPreview> {
    await this.goals.findOneOwned(dto.goalId, user.userId);
    const parsedDate = contributionDate(dto.movementDate);
    const movementDate =
      dto.movementDate === currentRecordDay() ? new Date() : parsedDate;
    const period = contributionPeriod(movementDate);
    if (period !== contributionPeriod())
      throw new ConflictException(
        'Los nuevos aportes de Cashy solo pueden usar el presupuesto del mes actual.',
      );
    const money = contributionMoney(
      dto.amount,
      dto.currency,
      dto.exchangeRateArsPerUsd,
    );
    const platform = dto.platform.trim().toUpperCase();
    if (!platform) throw new ConflictException('Seleccioná una plataforma.');
    const state = await this.links.status(user);
    if (state.status !== 'active' || !state.enabled)
      throw new ForbiddenException(
        'Vinculá y habilitá tu cuenta Cashy antes de preparar el aporte.',
      );
    if (!state.detailsFresh)
      throw new ServiceUnavailableException(
        'No se pudo verificar la conexión con Cashy.',
      );
    if (!state.accessAvailable)
      throw new ForbiddenException(
        'El acceso compartido con Cashy está suspendido.',
      );
    await this.links.authorize(user, state.link.id, 'contributions:write');
    const result = await this.links.allocation(user, period, state.link.id);
    if (result.status !== 'available' || !result.budgetDefined)
      throw new ConflictException(
        'Definí primero el sueldo y presupuesto del mes en Cashy.',
      );
    if (money.allocationAmountMinor > result.allocation.availableMinor)
      throw new ConflictException(
        'El aporte supera el presupuesto disponible en Cashy.',
      );
    await this.links.authorize(user, state.link.id, 'contributions:write');
    if (period !== contributionPeriod())
      throw new ConflictException(
        'Cambió el mes durante la consulta. Volvé a preparar el aporte.',
      );
    const snapshot: CashyContributionPreview = {
      id: randomUUID(),
      status: 'prepared',
      source: 'cashy',
      goalId: dto.goalId,
      linkId: state.link.id,
      allocationId: result.allocation.id,
      allocationVersion: result.allocation.version,
      period,
      platform,
      movementDate: movementDate.toISOString(),
      currency: dto.currency,
      ...money,
      availableMinor: result.allocation.availableMinor,
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    };
    await this.previews.create({
      _id: snapshot.id,
      userId: user.userId,
      snapshot,
      expiresAt: new Date(snapshot.expiresAt),
    });
    return snapshot;
  }
}
