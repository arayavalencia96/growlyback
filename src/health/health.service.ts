import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConnectionStates, type Connection } from 'mongoose';
import type { IResult } from '../common/interfaces/common.interface';
import type { IHealthResponse } from './interfaces/health.interface';

@Injectable()
export class HealthService {
  constructor(
    @InjectConnection() private readonly databaseConnection: Connection,
  ) {}

  async check(): Promise<IHealthResponse> {
    const startedAt = performance.now();

    try {
      const database = this.databaseConnection.db;
      if (
        this.databaseConnection.readyState !== ConnectionStates.connected ||
        !database
      ) {
        throw new Error('MongoDB connection is not ready');
      }

      await database.admin().ping();

      return this.createHealthResponse(
        'up',
        Math.round(performance.now() - startedAt),
      );
    } catch {
      const result = this.createHealthResponse(
        'down',
        Math.round(performance.now() - startedAt),
      );
      const response: IResult<IHealthResponse> = {
        result,
        message: 'Service unavailable',
        description: 'MongoDB connection is unavailable',
        statuscode: 503,
        ok: false,
      };

      throw new ServiceUnavailableException(response);
    }
  }

  private createHealthResponse(
    status: IHealthResponse['status'],
    responseTimeMs: number,
  ): IHealthResponse {
    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status,
        responseTimeMs,
      },
    };
  }
}
