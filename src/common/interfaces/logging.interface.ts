import type { Request } from 'express';
import type { IAuthenticatedUser } from '../auth/interfaces/auth.interface';

export interface IHttpLoggingRequest extends Request {
  requestId: string;
  requestStartedAt: number;
  user?: IAuthenticatedUser;
}

export interface IHttpLogActor {
  userId: string;
  email: string;
  authenticated: boolean;
}

export interface IHttpSuccessLog {
  event: 'http_request_completed';
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  actor: IHttpLogActor;
  result: unknown;
}

export interface IHttpErrorLog {
  event: 'http_request_failed';
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  actor: IHttpLogActor;
  error: unknown;
}
