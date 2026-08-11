import { Inject, Injectable } from '@nestjs/common';
import { canonicalize } from '../common/json/canonicalize';
import type { JsonValue } from '../common/json/json.types';
import { SIGNER, type Signer } from './ports/signer.port';

/**
 * Domain service for the signature feature. Depends only on the `Signer`
 * port and on the shared `canonicalize` helper — it has no knowledge of
 * HMAC, `node:crypto`, or NestJS HTTP concerns.
 */
@Injectable()
export class SignatureService {
  constructor(@Inject(SIGNER) private readonly signer: Signer) {}

  /** Computes the signature of a JSON payload, independent of key order. */
  sign(payload: JsonValue): string {
    return this.signer.sign(canonicalize(payload));
  }

  /** Verifies `data` against `signature`, independent of key order. */
  verify(data: JsonValue, signature: string): boolean {
    return this.signer.verify(canonicalize(data), signature);
  }
}
