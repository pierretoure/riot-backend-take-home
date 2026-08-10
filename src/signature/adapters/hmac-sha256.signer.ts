import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Signer } from '../ports/signer.port';

/**
 * HMAC-SHA256 `Signer`, hex-encoded (lowercase), backed exclusively by
 * `node:crypto` (cahier des charges §2/§8). The secret has no default: it is
 * always read from `ConfigService`, which itself only exposes it once the
 * env schema validation (`src/config/env.schema.ts`) has confirmed a valid
 * `HMAC_SECRET` is present (fail-fast at startup, §5).
 */
@Injectable()
export class HmacSha256Signer implements Signer {
  constructor(private readonly configService: ConfigService) {}

  sign(payload: string): string {
    return createHmac('sha256', this.secret()).update(payload).digest('hex');
  }

  verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload), 'hex');
    // `Buffer.from(_, 'hex')` never throws on non-hexadecimal input: it
    // silently stops decoding at the first invalid character, producing a
    // shorter (possibly empty) buffer. Combined with the length check below,
    // this means a malformed candidate signature safely resolves to `false`
    // rather than raising an exception.
    const candidate = Buffer.from(signature, 'hex');

    // `timingSafeEqual` throws on a buffer length mismatch; check first so a
    // signature of the wrong length is treated as merely invalid.
    if (expected.length !== candidate.length) {
      return false;
    }

    return timingSafeEqual(expected, candidate);
  }

  /**
   * Reads the HMAC secret from configuration. Never logged, never included
   * in an error message or thrown exception.
   */
  private secret(): string {
    const secret = this.configService.get<string>('HMAC_SECRET');
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error('HMAC_SECRET is not configured');
    }
    return secret;
  }
}
