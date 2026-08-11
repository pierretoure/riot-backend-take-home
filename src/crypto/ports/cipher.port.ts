/**
 * `looksEncrypted` lives on the port rather than on `CryptoService` because
 * the detection heuristic is algorithm-specific: a Base64 implementation and
 * an AES implementation do not share the same notion of "this looks like
 * ciphertext". Moving it into the service would leak an adapter-specific
 * concern into the domain layer.
 */
export interface Cipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
  /** Can `value` plausibly be ciphertext produced by this Cipher? */
  looksEncrypted(value: string): boolean;
}

export const CIPHER = Symbol('CIPHER');
