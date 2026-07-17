import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { IHttpLoggingRequest } from '../interfaces/logging.interface';

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/;

@Injectable()
export class HttpContextMiddleware implements NestMiddleware {
  use(
    request: IHttpLoggingRequest,
    response: Response,
    next: NextFunction,
  ): void {
    const receivedRequestId = request.header('x-request-id');
    const requestId =
      receivedRequestId && REQUEST_ID_PATTERN.test(receivedRequestId)
        ? receivedRequestId
        : randomUUID();

    request.requestId = requestId;
    request.requestStartedAt = Date.now();
    response.setHeader('x-request-id', requestId);
    next();
  }
}
