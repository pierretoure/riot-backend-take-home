import { BadRequestException } from '@nestjs/common';
import type { JsonValue } from '../../common/json/json.types';

/**
 * Validates that the `POST /sign` request body is a JSON object (cahier des
 * charges §6: a non-object root — array or scalar — must be rejected with
 * `400`). See `verify-request.dto.ts` for why this is a plain function
 * rather than a `class-validator`-decorated class.
 */
export function parseSignRequest(body: unknown): JsonValue {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('Request body must be a JSON object');
  }

  return body as JsonValue;
}
