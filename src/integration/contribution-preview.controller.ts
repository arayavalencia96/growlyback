import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Param,
  Query,
  Req,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import type { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import { IntegrationExceptionFilter } from './integration-exception.filter';
import { ContributionPreviewService } from './contribution-preview.service';
import { ContributionPreviewDto } from './contribution-preview.dto';
import type { IntegrationResponse } from './integration.contracts';
import type { CashyContributionPreview } from './contribution-preview.contracts';
import { ContributionJobService } from './contribution-job.service';
import { ContributionConfirmDto } from './contribution-confirm.dto';
import { requireLinkId } from './link-input';
import { BadRequestException } from '@nestjs/common';
import { ContributionAdjustmentService } from './contribution-adjustment.service';
import { ContributionAdjustmentDto } from './contribution-adjustment.dto';

@Controller('integration/contribution')
@UseFilters(IntegrationExceptionFilter)
export class ContributionPreviewController {
  constructor(
    private readonly adjustments: ContributionAdjustmentService,
    private readonly previews: ContributionPreviewService,
    private readonly jobs: ContributionJobService,
  ) {}

  @Post(':id/adjust')
  @HttpCode(200)
  async adjust(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: ContributionAdjustmentDto,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.success(
      await this.adjustments.submit(
        requireLinkId(id),
        dto,
        request.user.userId,
      ),
    );
  }
  @Get(':id/adjustments')
  async adjustmentsList(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Param('id') id: string,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.success(
      await this.adjustments.list(requireLinkId(id), request.user.userId),
    );
  }
  @Post(':id/reconcile')
  @HttpCode(200)
  async reconcile(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Param('id') id: string,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.success(
      await this.jobs.reconcile(requireLinkId(id), request.user.userId),
    );
  }
  @Post(':id/cancel-pending')
  @HttpCode(200)
  async cancelPending(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Param('id') id: string,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.success(
      await this.jobs.cancelPending(requireLinkId(id), request.user.userId),
    );
  }

  @Post('confirm')
  @HttpCode(200)
  async confirm(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Body() dto: ContributionConfirmDto,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.success(await this.jobs.confirm(dto, request.user));
  }

  @Get()
  async list(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Query('goalId') goalId: string,
  ) {
    if (!request.user) throw new UnauthorizedException();
    if (typeof goalId !== 'string' || !/^[a-f0-9]{24}$/i.test(goalId))
      throw new BadRequestException('Objetivo inválido.');
    return this.success(await this.jobs.list(goalId, request.user.userId));
  }

  @Get(':id')
  async status(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Param('id') id: string,
  ) {
    if (!request.user) throw new UnauthorizedException();
    return this.success(
      await this.jobs.get(requireLinkId(id), request.user.userId),
    );
  }

  private success<T>(result: T): IntegrationResponse<T> {
    return {
      result,
      message: 'Aporte procesado',
      description: 'Estado persistente de la integración con Cashy',
      statuscode: 200,
      ok: true,
    };
  }

  @Post('preview')
  @HttpCode(200)
  async prepare(
    @Req() request: Request & { user: IAuthenticatedUser },
    @Body() dto: ContributionPreviewDto,
  ): Promise<IntegrationResponse<CashyContributionPreview>> {
    if (!request.user) throw new UnauthorizedException();
    return {
      result: await this.previews.prepare(dto, request.user),
      message: 'Aporte preparado',
      description:
        'Vista previa: no reserva ni descuenta dinero y no crea movimientos.',
      statuscode: 200,
      ok: true,
    };
  }
}
