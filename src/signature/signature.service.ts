import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { JsonCanonicalizationError } from '../common/json/canonicalize.error';
import { canonicalize } from '../common/json/canonicalize';
import type { JsonValue } from '../common/json/json.types';
import { SIGNER, type Signer } from './ports/signer.port';

@Injectable()
export class SignatureService {
  constructor(@Inject(SIGNER) private readonly signer: Signer) {}

  /** Computes the signature of a JSON payload, independent of key order. */
  sign(payload: JsonValue): string {
    return this.signer.sign(this.canonical(payload));
  }

  /** Verifies `data` against `signature`, independent of key order. */
  verify(data: JsonValue, signature: string): boolean {
    return this.signer.verify(this.canonical(data), signature);
  }

  /**
   * Canonicalizes a payload, translating an RFC 8785 violation into a 400.
   *
   * `canonicalize` is deliberately free of any NestJS dependency, so the
   * mapping from "this input has no canonical form" to an HTTP status
   * belongs here — the single boundary where the pure serialization module
   * meets the HTTP domain. Without it a payload such as `{"a":1e400}`
   * (which `JSON.parse` turns into `Infinity`) would surface as a 500,
   * breaking the guarantee that no client input produces a server error.
   *
   * The thrown message is the canonicalizer's own, which describes the rule
   * that was broken and never echoes payload content.
   */
  private canonical(value: JsonValue): string {
    try {
      return canonicalize(value);
    } catch (error) {
      if (error instanceof JsonCanonicalizationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
