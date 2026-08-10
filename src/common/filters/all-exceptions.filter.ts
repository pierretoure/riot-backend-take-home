import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from '../interceptors/logging.interceptor';

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  requestId: string;
}

/** Human-readable phrase for an HTTP status code, e.g. 404 -> "Not Found". */
function statusText(status: number): string {
  const key = (HttpStatus as unknown as Record<number, string | undefined>)[
    status
  ];
  if (typeof key !== 'string') {
    return 'Error';
  }
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Global exception filter producing the homogeneous error format defined in
 * the cahier des charges §6: `{ statusCode, error, message, requestId }`.
 *
 * Any exception that is not a Nest `HttpException` is treated as an
 * unexpected server error: its stack trace is logged server-side, but the
 * client only ever receives a generic 500 message. This guarantees that no
 * internal implementation detail (stack trace, exception class name, raw
 * error message) ever leaks into the HTTP response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithId>();
    const requestId = request.requestId ?? 'unknown';

    const body = this.buildBody(exception, requestId);

    if (!(exception instanceof HttpException)) {
      this.logger.error(
        exception instanceof Error
          ? (exception.stack ?? exception.message)
          : `Non-error value thrown: ${String(exception)}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, requestId: string): ErrorResponseBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const raw = exception.getResponse();

      if (typeof raw === 'string') {
        return {
          statusCode,
          error: statusText(statusCode),
          message: raw,
          requestId,
        };
      }

      if (typeof raw === 'object' && raw !== null) {
        const payload = raw as Record<string, unknown>;
        const message =
          typeof payload.message === 'string' || Array.isArray(payload.message)
            ? (payload.message as string | string[])
            : exception.message;
        const error =
          typeof payload.error === 'string'
            ? payload.error
            : statusText(statusCode);
        return { statusCode, error, message, requestId };
      }

      return {
        statusCode,
        error: statusText(statusCode),
        message: exception.message,
        requestId,
      };
    }

    // Any non-HttpException is an unexpected failure: never forward its
    // message to the client, which would risk leaking implementation
    // details (see class doc comment).
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: statusText(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Internal server error',
      requestId,
    };
  }
}
