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
 * Shape of an `http-errors` style exception. Express middleware that runs
 * before Nest's own pipeline (notably `body-parser`, which raises a 413
 * `PayloadTooLargeError`) throws these rather than Nest `HttpException`s.
 */
interface HttpErrorLike {
  status?: unknown;
  statusCode?: unknown;
  expose?: unknown;
  message?: unknown;
}

/**
 * Extracts a client-error status (4xx) carried by an `http-errors` style
 * exception. Returns `undefined` for anything else, including 5xx: an
 * unexpected server failure must stay a generic 500 with no detail.
 */
function clientErrorStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }

  const candidate = exception as HttpErrorLike;
  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.statusCode === 'number'
        ? candidate.statusCode
        : undefined;

  if (status === undefined || !Number.isInteger(status)) {
    return undefined;
  }

  return status >= 400 && status < 500 ? status : undefined;
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

    if (!(exception instanceof HttpException) && body.statusCode >= 500) {
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

    // Express middleware running ahead of Nest's pipeline throws
    // `http-errors` objects instead of `HttpException`s. A 413 from
    // `body-parser` must stay a 413: mapping it to 500 would break the
    // guarantee that no client input can produce a server error (§6).
    const status = clientErrorStatus(exception);
    if (status !== undefined) {
      const candidate = exception as HttpErrorLike;
      // Only trust the message when the library marked it as safe to expose.
      const message =
        candidate.expose === true && typeof candidate.message === 'string'
          ? candidate.message
          : statusText(status);

      return {
        statusCode: status,
        error: statusText(status),
        message,
        requestId,
      };
    }

    // Any other non-HttpException is an unexpected failure: never forward
    // its message to the client, which would risk leaking implementation
    // details (see class doc comment).
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: statusText(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Internal server error',
      requestId,
    };
  }
}
