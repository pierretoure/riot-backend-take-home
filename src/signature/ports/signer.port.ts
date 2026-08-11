/** Port for a pluggable signature algorithm. */
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

export const SIGNER = Symbol('SIGNER');
