import {
  BadRequestException,
  Injectable,
  type NestMiddleware,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  StrictJsonBodyError,
  assertStrictJsonBody,
} from '../json/assert-strict-json-body';

/**
 * Request with the raw body buffer attached by Nest. Populated only when
 * the application is created with `rawBody: true` (see `src/main.ts` and
 * `src/testing/create-test-app.ts`).
 */
interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * Applies the RFC 8785 input constraints that can only be checked on the
 * raw bytes — valid UTF-8, no duplicate property names — to every route
 * that accepts a JSON payload.
 *
 * It runs after the JSON body parser, so the body is already known to be
 * well-formed JSON; a malformed one has been rejected with the usual 400
 * before reaching here.
 */
@Injectable()
export class StrictJsonBodyMiddleware implements NestMiddleware {
  use(
    request: RequestWithRawBody,
    _response: Response,
    next: NextFunction,
  ): void {
    const { rawBody } = request;

    // Absent for a request with no body at all — the empty-body case is
    // already handled downstream by the route pipes.
    if (rawBody === undefined || rawBody.length === 0) {
      next();
      return;
    }

    try {
      assertStrictJsonBody(rawBody);
    } catch (error) {
      if (error instanceof StrictJsonBodyError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    next();
  }
}
