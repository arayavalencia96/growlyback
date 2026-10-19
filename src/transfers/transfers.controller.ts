import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { TransferFormService } from './transfer-form.service';
import { TransferSubmissionService } from './transfer-submission.service';
import {
  CreateTransferDto,
  TransferContextDto,
  transferInput,
} from './dto/transfers.dto';
import type { Request } from 'express';
import type { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import type { IResult } from '../common/interfaces/common.interface';
import type { TransferRecord, TransferSetupStatus } from './transfer.contracts';
import { TransfersService } from './transfers.service';
import { TransfersRepository } from './transfers.repository';
import {
  FindTransfersDto,
  TransferIdDto,
  TransferKeyDto,
} from './dto/transfers.dto';

type AuthenticatedRequest = Request & { user: IAuthenticatedUser };

@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly repository: TransfersRepository,
    private readonly form: TransferFormService,
    private readonly submission: TransferSubmissionService,
  ) {}

  @Get('status')
  status(): IResult<TransferSetupStatus> {
    return {
      result: this.transfers.status(),
      message: 'Transferencias integradas en actividad y cartera',
      description:
        'Registro interno con costo contable conservado y validación transaccional al iniciar Growly',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Get('form-context')
  async context(
    @Query() query: TransferContextDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.result({
      ...(await this.form.context(query.goalId, request.user.userId)),
      enabled: this.transfers.status().enabled,
    });
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @Body() dto: CreateTransferDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.result(
      await this.form.preview(transferInput(dto), request.user.userId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(
    @Body() dto: CreateTransferDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<TransferRecord>> {
    return {
      ...this.result(
        await this.submission.submit(request.user.userId, transferInput(dto)),
      ),
      statuscode: HttpStatus.ACCEPTED,
    };
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @Param() params: TransferIdDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<TransferRecord>> {
    return {
      ...this.result(
        await this.submission.retry(request.user.userId, params.id),
      ),
      statuscode: HttpStatus.ACCEPTED,
    };
  }

  @Get('by-key/:idempotencyKey')
  async findByKey(
    @Param() params: TransferKeyDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<TransferRecord>> {
    return this.result(
      this.submission.view(
        await this.repository.findByKey(
          request.user.userId,
          params.idempotencyKey,
        ),
      ),
    );
  }

  @Get()
  async findAll(
    @Query() query: FindTransfersDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<TransferRecord[]>> {
    return this.result(
      (await this.repository.findAll(request.user.userId, query)).map(
        (record) => this.submission.view(record),
      ),
    );
  }

  @Get(':id')
  async findOne(
    @Param() params: TransferIdDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<TransferRecord>> {
    return this.result(
      this.submission.view(
        await this.repository.findOne(request.user.userId, params.id),
      ),
    );
  }

  private result<T>(result: T): IResult<T> {
    return {
      result,
      message: 'Consulta de transferencias',
      description:
        'Solo se consultan registros de tu cuenta. Una solicitud pendiente todavía no acredita dinero ni activos.',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
