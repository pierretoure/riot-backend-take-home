import type { Cipher } from '../ports/cipher.port';

/**
 * Base64 `Cipher` adapter.
 *
 * `encrypt`/`decrypt` operate on plain strings only: `CryptoService` is
 * responsible for `JSON.stringify`/`JSON.parse`, so that the encoding step
 * performed here (`base64(text)`) stays algorithm-specific and swappable.
 */
export class Base64Cipher implements Cipher {
  encrypt(plaintext: string): string {
    return Buffer.from(plaintext, 'utf8').toString('base64');
  }

  decrypt(ciphertext: string): string {
    return Buffer.from(ciphertext, 'base64').toString('utf8');
  }

  /**
   * Detects whether `value` plausibly is Base64 ciphertext produced by
   * `encrypt`, applying four criteria, all required, in order:
   *
   * 1. `value` matches the Base64 alphabet and its length is a multiple of 4.
   * 2. Round-trip: re-encoding the decoded bytes yields `value` back exactly
   *    (rejects non-canonical Base64, e.g. wrong padding).
   * 3. The decoded bytes form strictly valid UTF-8 — `TextDecoder`'s `fatal`
   *    mode is required here: `Buffer#toString('utf8')` silently replaces
   *    invalid byte sequences with U+FFFD instead of rejecting them, which
   *    would let arbitrary plaintext through as "encrypted".
   * 4. The decoded UTF-8 text is valid JSON (`CryptoService` always encrypts
   *    via `JSON.stringify`, so genuine ciphertext always decodes to JSON).
   *
   * Known limitation (documented in the README): this is a heuristic, not a
   * deterministic marker. Plaintext that happens to satisfy all four
   * criteria (e.g. the literal string `"MzA="`) is indistinguishable from
   * real ciphertext and will be decoded regardless.
   */
  looksEncrypted(value: string): boolean {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
      return false;
    }

    const bytes = Buffer.from(value, 'base64');
    if (bytes.toString('base64') !== value) {
      return false;
    }

    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return false;
    }

    try {
      JSON.parse(decoded);
    } catch {
      return false;
    }

    return true;
  }
}
