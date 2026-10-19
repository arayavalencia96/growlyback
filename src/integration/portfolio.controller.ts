import {
  Body,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Public } from '../common/auth/public.decorator';
import { SummariesService } from '../summaries/summaries.service';
import { AccountLinkService } from './account-link.service';
import { IntegrationPeerGuard } from './integration-peer.guard';
import { IntegrationExceptionFilter } from './integration-exception.filter';
import { parseLinkInput, requireLinkId } from './link-input';

@Controller('integration/peer')
@Public()
@UseFilters(IntegrationExceptionFilter)
@UseGuards(IntegrationPeerGuard)
export class PortfolioController {
  constructor(
    private readonly links: AccountLinkService,
    private readonly summaries: SummariesService,
  ) {}
  @Post('portfolio')
  @HttpCode(200)
  async get(@Body() body: unknown) {
    const input = parseLinkInput(body, ['growlyUserId', 'linkId']);
    if (!/^[a-f0-9]{24}$/i.test(input.growlyUserId))
      throw new UnauthorizedException('Cuenta Growly inválida.');
    const linkId = requireLinkId(input.linkId),
      user = { userId: input.growlyUserId };
    await this.links.authorize(user, linkId, 'portfolio:read');
    const result = await this.summaries.getPortfolioSummary(user.userId);
    await this.links.authorize(user, linkId, 'portfolio:read');
    return {
      result,
      message: 'Cartera consultada',
      description: 'Valor contable total y por plataforma',
      statuscode: 200,
      ok: true,
    };
  }
}
