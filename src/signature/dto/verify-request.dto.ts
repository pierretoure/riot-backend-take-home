import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { JsonValue } from '../../common/json/json.types';

/**
 * Request body of `POST /verify` (cahier des charges §4.4): both
 * `signature` and `data` are mandatory.
 *
 * Deliberately declared as a plain `interface`, not a `class`: NestJS's
 * global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform,
 * see `applyGlobalConfig`) only attempts validation/transformation when the
 * parameter's reflected metatype is a class. `class-validator` and
 * `class-transformer` are transitive (not direct) dependencies of this
 * project pulled in only by `@nestjs/common`/`@nestjs/config`'s own
 * internals — they are not resolvable from application source
 * (`tsc`/`pnpm typecheck` fails to find their type declarations), so no
 * decorator-based DTO can be used here without adding a new dependency,
 * which is out of scope for this task. Declaring the body parameter type as
 * an `interface` keeps the reflected metatype as `Object`, so the global
 * pipe lets the raw payload through untouched; `VerifyRequestPipe` below
 * validates it explicitly instead.
 */
export interface VerifyRequestDto {
  signature: string;
  data: JsonValue;
}

/**
 * Parameter-level pipe validating and narrowing an arbitrary request body
 * into a `VerifyRequestDto`, throwing `400 Bad Request` (via the global
 * exception filter, §6) on any violation. Mirrors `JsonPayloadPipe`'s
 * idiom (`@Body(VerifyRequestPipe)`) so both domains share the same
 * validation convention (cahier des charges, app-assembly step).
 */
@Injectable()
export class VerifyRequestPipe implements PipeTransform<
  unknown,
  VerifyRequestDto
> {
  transform(value: unknown): VerifyRequestDto {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new BadRequestException('Request body must be a JSON object');
    }

    const candidate = value as Record<string, unknown>;

    if (
      typeof candidate.signature !== 'string' ||
      candidate.signature.length === 0
    ) {
      throw new BadRequestException(
        'Property "signature" must be a non-empty string',
      );
    }

    if (!('data' in candidate) || candidate.data === undefined) {
      throw new BadRequestException('Property "data" is required');
    }

    return {
      signature: candidate.signature,
      data: candidate.data as JsonValue,
    };
  }
}
