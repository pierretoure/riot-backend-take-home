import type { Cipher } from '../ports/cipher.port';

/**
 * Character-rotation `Cipher` adapter (cahier des charges §3.3): a second,
 * trivial implementation of the `Cipher` port, not wired into
 * `crypto.module.ts`. Its sole purpose is to prove that swapping the
 * encryption algorithm truly requires no change outside
 * `crypto.module.ts` (see the shared contract test in
 * `cipher.contract.test.ts`).
 *
 * Every printable ASCII character (0x20-0x7E) is shifted forward by
 * `OFFSET` positions (wrapping within that range) to encrypt, and shifted
 * back by the same amount to decrypt; characters outside that range (e.g.
 * non-ASCII Unicode) are left untouched.
 */
export class RotCipher implements Cipher {
  // Printable ASCII range: 0x20 (space) through 0x7E (~), inclusive.
  private static readonly RANGE_START = 0x20;
  private static readonly RANGE_SIZE = 0x7f - 0x20;
  private static readonly OFFSET = 13;
  // Marker prefix identifying ciphertext produced by this adapter, since a
  // character-rotation cipher has no structural signature of its own to
  // distinguish ciphertext from plaintext (unlike Base64's alphabet/padding
  // constraints). This mirrors the "enveloppe" alternative mentioned in
  // cahier des charges §4.2, kept out of `Base64Cipher` to stay conformant
  // with the subject, but perfectly legitimate for this demonstration-only
  // adapter.
  private static readonly MARKER = 'rot13:';

  private rotate(input: string, direction: 1 | -1): string {
    let result = '';
    for (const char of input) {
      const code = char.codePointAt(0) ?? 0;
      if (code < RotCipher.RANGE_START || code > 0x7e) {
        // Outside the rotated range: left as-is.
        result += char;
        continue;
      }
      const shifted =
        (((code - RotCipher.RANGE_START + direction * RotCipher.OFFSET) %
          RotCipher.RANGE_SIZE) +
          RotCipher.RANGE_SIZE) %
        RotCipher.RANGE_SIZE;
      result += String.fromCodePoint(RotCipher.RANGE_START + shifted);
    }
    return result;
  }

  encrypt(plaintext: string): string {
    return RotCipher.MARKER + this.rotate(plaintext, 1);
  }

  decrypt(ciphertext: string): string {
    const withoutMarker = ciphertext.startsWith(RotCipher.MARKER)
      ? ciphertext.slice(RotCipher.MARKER.length)
      : ciphertext;
    return this.rotate(withoutMarker, -1);
  }

  looksEncrypted(value: string): boolean {
    return value.startsWith(RotCipher.MARKER);
  }
}
