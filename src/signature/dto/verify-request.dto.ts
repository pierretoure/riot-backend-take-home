import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import type { JsonValue } from '../../common/json/json.types';

export interface VerifyRequestDto {
  signature: string;
  data: JsonValue;
}

/**
 * Parameter-level pipe validating and narrowing an arbitrary request body
 * into a `VerifyRequestDto`, throwing `400 Bad Request` (via the global
 * exception filter) on any violation. Mirrors `JsonPayloadPipe`'s idiom
 * (`@Body(VerifyRequestPipe)`) so both domains share the same validation
 * convention.
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
