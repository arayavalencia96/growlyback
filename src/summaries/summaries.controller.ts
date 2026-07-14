import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { IResult } from '../common/interfaces/common.interface';
import { GoalSummaryParamsDto } from './dto/summaries.dto';
import { SummariesService } from './summaries.service';
import { IGoalSummaryResponse } from './interfaces/summaries.interface';

@ApiTags('summaries')
@Controller('summaries')
export class SummariesController {
  constructor(private readonly summariesService: SummariesService) {}

  @Get('goals/:goalId')
  @ApiOkResponse({ description: 'Goal summary retrieved successfully' })
  async getGoalSummary(
    @Param() params: GoalSummaryParamsDto,
  ): Promise<IResult<IGoalSummaryResponse>> {
    return {
      result: await this.summariesService.getGoalSummary(params.goalId),
      message: 'Goal summary retrieved successfully',
      description: 'Calculated from cash movements and investment operations',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
