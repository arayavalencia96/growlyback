import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import { AccountLinkService } from './account-link.service';
import { IntegrationExceptionFilter } from './integration-exception.filter';
import { parseLinkInput, requireLinkId } from './link-input';
import { Public } from '../common/auth/public.decorator';
import { IntegrationPeerGuard } from './integration-peer.guard';
import type { IntegrationResponse } from './integration.contracts';

type AuthenticatedRequest = Request & { user: IAuthenticatedUser };

@Controller('integration')
@UseFilters(IntegrationExceptionFilter)
export class AccountLinkController {
  constructor(private readonly links: AccountLinkService) {}

  @Get('link')
  async link(@Req() request: AuthenticatedRequest) {
    return this.success(await this.links.status(this.user(request)));
  }

  @Get('allocation')
  async allocation(
    @Req() request: AuthenticatedRequest,
    @Query('period') value: unknown,
  ) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const current =
      parts.find((part) => part.type === 'year')!.value +
      '-' +
      parts.find((part) => part.type === 'month')!.value;
    const period = value === undefined ? current : value;
    if (
      typeof period !== 'string' ||
      !/^20\d{2}-(0[1-9]|1[0-2])$/.test(period) ||
      period > current
    )
      throw new BadRequestException(
        'El período debe ser YYYY-MM y no puede ser futuro.',
      );
    return this.success(
      await this.links.allocation(this.user(request), period),
    );
  }

  @Post('link/preview')
  @HttpCode(200)
  async preview(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseLinkInput(body, ['requestToken']);
    return this.success(
      await this.links.preview(input.requestToken, this.user(request)),
    );
  }

  @Post('link/approve')
  @HttpCode(200)
  async approve(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseLinkInput(body, ['requestToken', 'expectedUserId']);
    if (input.expectedUserId !== this.user(request).userId) {
      throw new UnauthorizedException(
        'La cuenta Growly cambió. Volvé a revisar el consentimiento.',
      );
    }
    return this.success(
      await this.links.approve(input.requestToken, this.user(request)),
    );
  }

  @Post('link/deny')
  @HttpCode(200)
  async deny(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    this.user(request);
    const input = parseLinkInput(body, ['requestToken']);
    return this.success(await this.links.deny(input.requestToken));
  }

  private user(request: AuthenticatedRequest): IAuthenticatedUser {
    if (!request.user) throw new UnauthorizedException();
    return request.user;
  }

  @Post('link/revoke')
  @HttpCode(200)
  async revoke(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseLinkInput(body, ['linkId']);
    return this.success(
      await this.links.revoke(this.user(request), requireLinkId(input.linkId)),
    );
  }

  @Post('peer/link/account')
  @HttpCode(200)
  @Public()
  @UseGuards(IntegrationPeerGuard)
  async peerAccount(@Body() body: unknown) {
    const input = parseLinkInput(body, ['linkId', 'growlyUserId']);
    if (!/^[a-f0-9]{24}$/i.test(input.growlyUserId))
      throw new UnauthorizedException('Cuenta Growly inválida.');
    return this.success(
      await this.links.peerIdentity(
        input.growlyUserId,
        requireLinkId(input.linkId),
      ),
    );
  }

  private success<T>(result: T): IntegrationResponse<T> {
    return {
      result,
      message: 'Solicitud completada',
      description: 'Vinculación de cuentas',
      statuscode: 200,
      ok: true,
    };
  }
}
