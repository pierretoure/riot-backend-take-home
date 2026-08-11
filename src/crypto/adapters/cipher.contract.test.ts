import type { Cipher } from '../ports/cipher.port';
import { Base64Cipher } from './base64.cipher';

/**
 * Contract test for the `Cipher` port: every adapter must satisfy the same
 * behavioural contract regardless of its concrete algorithm. Run via
 * `describe.each` so a second adapter only has to be added to the list
 * below to be held to the same rules.
 */
const adapters: Array<{ name: string; create: () => Cipher }> = [
  { name: 'Base64Cipher', create: () => new Base64Cipher() },
];

describe.each(adapters)('$name (Cipher contract)', ({ create }) => {
  let cipher: Cipher;

  beforeEach(() => {
    cipher = create();
  });

  it('round-trips: decrypt(encrypt(x)) === x', () => {
    const samples = ['', 'hello world', '{"a":1}', '30', 'null', '日本語'];
    for (const sample of samples) {
      expect(cipher.decrypt(cipher.encrypt(sample))).toBe(sample);
    }
  });

  it('looksEncrypted(encrypt(x)) is true for JSON-text input', () => {
    // `Cipher.encrypt` operates on plain strings; in production it is always
    // called by `CryptoService` with a `JSON.stringify`-produced string,
    // which is exactly what `Base64Cipher.looksEncrypted`'s fourth criterion
    // expects back after decoding. Samples here are therefore valid JSON
    // text, matching real usage.
    //
    // The empty string is excluded for a different reason:
    // `Base64Cipher.looksEncrypted`'s first criterion requires at least one
    // Base64 character, so `encrypt('')` (which is `''`) cannot satisfy the
    // contract — a known, documented edge case rather than a bug.
    const samples = ['"hello world"', '{"a":1}', '30'];
    for (const sample of samples) {
      expect(cipher.looksEncrypted(cipher.encrypt(sample))).toBe(true);
    }
  });

  it('looksEncrypted is false for manifestly plain text', () => {
    expect(cipher.looksEncrypted('1998-11-19')).toBe(false);
  });
});
