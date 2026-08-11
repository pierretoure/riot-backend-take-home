/**
 * Port for a pluggable signature algorithm. The domain (`SignatureService`)
 * only ever depends on this interface; it has no knowledge of HMAC or
 * `node:crypto`.
 */
export interface Signer {
  /** Computes the signature of an already-serialized payload string. */
  sign(payload: string): string;

  /**
   * Verifies a candidate signature against an already-serialized payload
   * string. Implementations must never throw on malformed input (wrong
   * length, non-hexadecimal characters, etc.) — any such input is simply an
   * invalid signature.
   */
  verify(payload: string, signature: string): boolean;
}

/**
 * DI token used to bind a concrete `Signer` implementation. Swapping the
 * signing algorithm requires changing only the provider bound to this token
 * in `signature.module.ts`.
 */
export const SIGNER = Symbol('SIGNER');
