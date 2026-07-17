import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { IHttpLoggingRequest } from '../interfaces/logging.interface';
import { HttpLoggerService } from '../services/http-logger.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly httpLoggerService: HttpLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<IHttpLoggingRequest>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      tap((result: unknown) => {
        this.httpLoggerService.logSuccess(request, response.statusCode, result);
      }),
    );
  }
}
