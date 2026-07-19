import { Controller, Get, HttpStatus, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { IAuthenticatedUser } from '../common/auth/interfaces/auth.interface';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IResult } from '../common/interfaces/common.interface';
import { GoalSummaryParamsDto } from './dto/summaries.dto';
import { SummariesService } from './summaries.service';
import {
  IGoalSummaryResponse,
  IPortfolioSummaryResponse,
} from './interfaces/summaries.interface';

type AuthenticatedRequest = Request & { user: IAuthenticatedUser };

@ApiTags('summaries')
@Controller('summaries')
export class SummariesController {
  constructor(private readonly summariesService: SummariesService) {}

  @Get('portfolio')
  @ApiOkResponse({ description: 'Portfolio summary retrieved successfully' })
  async getPortfolioSummary(
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<IPortfolioSummaryResponse>> {
    return {
      result: await this.summariesService.getPortfolioSummary(
        request.user.userId,
      ),
      message: 'Portfolio summary retrieved successfully',
      description: 'Book value grouped by platform across all user goals',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }

  @Get('goals/:goalId')
  @ApiOkResponse({ description: 'Goal summary retrieved successfully' })
  async getGoalSummary(
    @Param() params: GoalSummaryParamsDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<IResult<IGoalSummaryResponse>> {
    return {
      result: await this.summariesService.getGoalSummary(
        params.goalId,
        request.user.userId,
      ),
      message: 'Goal summary retrieved successfully',
      description: 'Calculated from cash movements and investment operations',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
