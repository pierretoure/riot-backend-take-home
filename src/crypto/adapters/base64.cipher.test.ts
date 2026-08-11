import { Base64Cipher } from './base64.cipher';

describe('Base64Cipher', () => {
  let cipher: Base64Cipher;

  beforeEach(() => {
    cipher = new Base64Cipher();
  });

  describe('encrypt/decrypt', () => {
    it('base64-encodes the given plaintext', () => {
      expect(cipher.encrypt('30')).toBe('MzA=');
    });

    it('decodes back the original plaintext', () => {
      expect(cipher.decrypt('MzA=')).toBe('30');
    });

    it('round-trips arbitrary text, unicode included', () => {
      const text = '{"email":"jöhn@example.com"}';
      expect(cipher.decrypt(cipher.encrypt(text))).toBe(text);
    });
  });

  describe('looksEncrypted', () => {
    // Literal examples from subject.md.
    it('rejects "1998-11-19" (criterion 1: not Base64 alphabet)', () => {
      expect(cipher.looksEncrypted('1998-11-19')).toBe(false);
    });

    it('rejects "John" (criteria 1-2 pass, criterion 3 fails: invalid UTF-8)', () => {
      expect(cipher.looksEncrypted('John')).toBe(false);
    });

    it('accepts "MzA=" (all four criteria pass, decodes to number 30)', () => {
      expect(cipher.looksEncrypted('MzA=')).toBe(true);
      expect(JSON.parse(cipher.decrypt('MzA=')) as number).toBe(30);
    });

    it('rejects a value whose length is not a multiple of 4', () => {
      expect(cipher.looksEncrypted('abcde')).toBe(false);
    });

    it('rejects non-canonical Base64 that fails the round-trip check', () => {
      // "A" alone decodes to 0 bits of usable data; feed a string that is
      // syntactically valid Base64 but does not round-trip to itself.
      expect(cipher.looksEncrypted('====')).toBe(false);
    });

    it('rejects Base64 whose decoded bytes are not valid JSON', () => {
      // "aGVsbG8=" -> "hello": valid Base64, valid UTF-8, not valid JSON.
      expect(cipher.looksEncrypted('aGVsbG8=')).toBe(false);
    });

    it('accepts ciphertext produced by encrypt() for arbitrary values', () => {
      const ciphertext = cipher.encrypt(JSON.stringify({ a: 1 }));
      expect(cipher.looksEncrypted(ciphertext)).toBe(true);
    });
  });
});
