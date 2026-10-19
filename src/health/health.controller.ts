import { Controller, Get, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator';
import type { IResult } from '../common/interfaces/common.interface';
import { HealthService } from './health.service';
import type { IHealthResponse } from './interfaces/health.interface';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  @ApiOkResponse({ description: 'API and MongoDB are operational' })
  @ApiServiceUnavailableResponse({ description: 'MongoDB is unavailable' })
  async check(): Promise<IResult<IHealthResponse>> {
    const health = await this.healthService.check();

    return {
      result: health,
      message: 'Service is healthy',
      description: 'API and MongoDB are operational',
      statuscode: HttpStatus.OK,
      ok: true,
    };
  }
}
