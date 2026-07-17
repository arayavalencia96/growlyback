import { Injectable, Logger } from '@nestjs/common';
import type { IHttpLoggingRequest } from '../interfaces/logging.interface';
import { sanitizeForLog } from '../utils/log-sanitizer.util';

@Injectable()
export class HttpLoggerService {
  private readonly logger = new Logger('HTTP');

  logSuccess(
    request: IHttpLoggingRequest,
    statusCode: number,
    result: unknown,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'http_request_completed',
        requestId: request.requestId,
        method: request.method,
        path: request.originalUrl,
        statusCode,
        durationMs: this.duration(request),
        actor: this.actor(request),
        result: sanitizeForLog(result),
      }),
    );
  }

  logError(
    request: IHttpLoggingRequest,
    statusCode: number,
    error: unknown,
  ): void {
    const entry = JSON.stringify({
      event: 'http_request_failed',
      requestId: request.requestId,
      method: request.method,
      path: request.originalUrl,
      statusCode,
      durationMs: this.duration(request),
      actor: this.actor(request),
      error: sanitizeForLog(error),
    });

    if (statusCode >= 500) {
      this.logger.error(
        entry,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    this.logger.warn(entry);
  }

  private actor(request: IHttpLoggingRequest) {
    if (request.user) {
      return {
        userId: request.user.userId,
        email: request.user.email,
        authenticated: true,
      };
    }

    const body = request.body as Record<string, unknown> | undefined;
    const email = typeof body?.email === 'string' ? body.email : 'anonymous';

    return {
      userId: 'anonymous',
      email,
      authenticated: false,
    };
  }

  private duration(request: IHttpLoggingRequest): number {
    return Math.max(0, Date.now() - request.requestStartedAt);
  }
}
