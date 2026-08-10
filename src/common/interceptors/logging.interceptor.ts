import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type LogLevel,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Log levels exposed by the application's public configuration (see
 * `src/config/env.schema.ts`), following the pino/syslog-style scale.
 */
export type ConfigLogLevel =
  'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Translates the application's public `LOG_LEVEL` scale into the level
 * names understood by Nest's built-in `Logger`. The config scale is kept
 * untouched (it is the application's public contract, see §5/§9 of the
 * cahier des charges) — this is purely an internal mapping.
 */
export function mapToNestLogLevel(level: ConfigLogLevel): LogLevel {
  switch (level) {
    case 'fatal':
      return 'fatal';
    case 'error':
      return 'error';
    case 'warn':
      return 'warn';
    case 'info':
      return 'log';
    case 'debug':
      return 'debug';
    case 'trace':
      return 'verbose';
  }
}

/** Request, augmented with the request id resolved by `LoggingInterceptor`. */
export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * A "plausible" request id: a non-empty, reasonably short string made of
 * characters commonly found in UUIDs/ULIDs. Anything else (missing header,
 * empty value, multiple values, exotic characters) is treated as untrusted
 * client input and replaced by a freshly generated id.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  if (candidate !== undefined && REQUEST_ID_PATTERN.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

interface RequestLogLine {
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  requestId: string;
}

/**
 * Attaches a request id to every request (reused from `x-request-id` when
 * plausible, generated otherwise), exposes it on the response header, and
 * logs a single structured JSON line once the response has been sent.
 *
 * Only request metadata is logged — method, route, status code, duration
 * and request id. Request/response bodies, secrets and full signatures are
 * never included.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();

    const requestId = resolveRequestId(request.headers['x-request-id']);
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    const startedAt = process.hrtime.bigint();

    // The 'finish' event fires once the response has actually been sent,
    // whether the request handler succeeded or an exception was caught by
    // the global exception filter — this is the only point at which
    // `response.statusCode` is guaranteed to be final.
    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      const line: RequestLogLine = {
        method: request.method,
        route: this.resolveRoute(request),
        statusCode: response.statusCode,
        durationMs,
        requestId,
      };

      const severity = this.severityFor(response.statusCode);
      this.logger[severity](JSON.stringify(line));
    });

    return next.handle();
  }

  private resolveRoute(request: Request): string {
    const routePath = (request.route as { path?: string } | undefined)?.path;
    return routePath ?? request.originalUrl ?? request.url;
  }

  private severityFor(statusCode: number): 'log' | 'warn' | 'error' {
    if (statusCode >= 500) {
      return mapToNestLogLevel('error') as 'error';
    }
    if (statusCode >= 400) {
      return mapToNestLogLevel('warn') as 'warn';
    }
    return mapToNestLogLevel('info') as 'log';
  }
}
