import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Response } from 'express';
import type { IHttpLoggingRequest } from '../interfaces/logging.interface';
import { HttpLoggerService } from '../services/http-logger.service';

@Catch()
@Injectable()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly httpLoggerService: HttpLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<IHttpLoggingRequest>();
    const response = http.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode,
            message: 'Internal server error',
          };

    const errorDetails =
      exception instanceof HttpException
        ? {
            name: exception.name,
            message: exception.message,
            response: responseBody,
          }
        : exception;

    this.httpLoggerService.logError(request, statusCode, errorDetails);
    this.httpAdapterHost.httpAdapter.reply(response, responseBody, statusCode);
  }
}
