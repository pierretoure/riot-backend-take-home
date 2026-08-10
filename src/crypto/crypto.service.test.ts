import { BadRequestException } from '@nestjs/common';
import { Base64Cipher } from './adapters/base64.cipher';
import {
  CryptoService,
  MAX_TOP_LEVEL_PROPERTIES,
  MAX_VALUE_DEPTH,
} from './crypto.service';
import type { JsonObject, JsonValue } from '../common/json/json.types';

/**
 * Minimal fake `Cipher` used to exercise `CryptoService` in isolation from
 * any concrete algorithm: it just prefixes/strips a marker, and
 * `looksEncrypted` is driven by that marker plus JSON-parseability, mirroring
 * the shape of a real adapter without depending on Base64 specifics.
 */
class FakeCipher {
  private static readonly MARKER = 'FAKE:';

  encrypt(plaintext: string): string {
    return FakeCipher.MARKER + plaintext;
  }

  decrypt(ciphertext: string): string {
    return ciphertext.startsWith(FakeCipher.MARKER)
      ? ciphertext.slice(FakeCipher.MARKER.length)
      : ciphertext;
  }

  looksEncrypted(value: string): boolean {
    if (!value.startsWith(FakeCipher.MARKER)) {
      return false;
    }
    try {
      JSON.parse(value.slice(FakeCipher.MARKER.length));
      return true;
    } catch {
      return false;
    }
  }
}

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    service = new CryptoService(new FakeCipher());
  });

  describe('encryptPayload', () => {
    it('encrypts every depth-1 property via JSON.stringify + cipher.encrypt', () => {
      const result = service.encryptPayload({ age: 30, name: 'John' });

      expect(result).toEqual({
        age: 'FAKE:30',
        name: 'FAKE:"John"',
      });
    });

    it('encrypts nested objects as a single opaque value (depth 1 only)', () => {
      const result = service.encryptPayload({
        contact: { email: 'john@example.com' },
      });

      expect(result.contact).toBe(
        'FAKE:' + JSON.stringify({ email: 'john@example.com' }),
      );
    });

    it('encrypts null', () => {
      const result = service.encryptPayload({ a: null });
      expect(result.a).toBe('FAKE:null');
    });

    it('rejects payloads with more top-level properties than allowed', () => {
      const payload: JsonObject = {};
      for (let i = 0; i < MAX_TOP_LEVEL_PROPERTIES + 1; i += 1) {
        payload[`k${i}`] = i;
      }

      expect(() => service.encryptPayload(payload)).toThrow(
        BadRequestException,
      );
    });

    it('rejects a property value nested deeper than the allowed limit', () => {
      let deep: JsonValue = 0;
      for (let i = 0; i < MAX_VALUE_DEPTH + 1; i += 1) {
        deep = { a: deep };
      }

      expect(() => service.encryptPayload({ deep })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('decryptPayload', () => {
    it('decrypts every depth-1 property detected as ciphertext', () => {
      const encrypted = service.encryptPayload({ age: 30, name: 'John' });
      const result = service.decryptPayload(encrypted);

      expect(result).toEqual({ age: 30, name: 'John' });
    });

    it('leaves properties not detected as ciphertext strictly unchanged', () => {
      const payload = {
        name: 'FAKE:"John"',
        birth_date: '1998-11-19',
      };

      const result = service.decryptPayload(payload);

      expect(result).toEqual({ name: 'John', birth_date: '1998-11-19' });
    });

    it('leaves non-string values strictly unchanged', () => {
      const payload = { age: 30, flag: true, data: null };
      expect(service.decryptPayload(payload)).toEqual(payload);
    });

    it('rejects payloads with more top-level properties than allowed', () => {
      const payload: JsonObject = {};
      for (let i = 0; i < MAX_TOP_LEVEL_PROPERTIES + 1; i += 1) {
        payload[`k${i}`] = 'v';
      }

      expect(() => service.decryptPayload(payload)).toThrow(
        BadRequestException,
      );
    });

    it('rejects a pass-through property value nested deeper than the allowed limit', () => {
      let deep: JsonValue = 0;
      for (let i = 0; i < MAX_VALUE_DEPTH + 1; i += 1) {
        deep = { a: deep };
      }

      // Not detected as ciphertext (it's not a string at all), so it would
      // otherwise be returned unchanged — and later crash `JSON.stringify`
      // when the HTTP response is serialized.
      expect(() => service.decryptPayload({ deep })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('with Base64Cipher (subject.md literal example)', () => {
    beforeEach(() => {
      service = new CryptoService(new Base64Cipher());
    });

    it('round-trips the README example, birth_date left unchanged', () => {
      const original = {
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
      };

      const encrypted = service.encryptPayload(original);
      for (const value of Object.values(encrypted)) {
        expect(typeof value).toBe('string');
      }

      const decryptedInput = { ...encrypted, birth_date: '1998-11-19' };
      const decrypted = service.decryptPayload(decryptedInput);

      expect(decrypted).toEqual({ ...original, birth_date: '1998-11-19' });
    });
  });

  // A plain `result[key] = value` invokes the `Object.prototype` setter for
  // the key `__proto__`, which silently drops the property (string value) or
  // replaces the result's prototype (object value). Both break the
  // round-trip guarantee, so properties are added with `defineProperty`.
  describe('prototype-sensitive keys', () => {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    it.each(dangerousKeys)('round-trips the %s key without loss', (key) => {
      const original = JSON.parse(
        `{"${key}": {"nested": "value"}, "safe": 1}`,
      ) as JsonObject;

      const decrypted = service.decryptPayload(
        service.encryptPayload(original),
      );

      expect(Object.keys(decrypted).sort()).toEqual([key, 'safe'].sort());
      expect(decrypted).toEqual(original);
    });

    it('keeps a __proto__ property own and enumerable rather than reassigning the prototype', () => {
      const original = JSON.parse(
        '{"__proto__": {"polluted": "yes"}}',
      ) as JsonObject;

      const encrypted = service.encryptPayload(original);

      expect(Object.keys(encrypted)).toEqual(['__proto__']);
      expect(
        Object.getOwnPropertyDescriptor(encrypted, '__proto__')?.enumerable,
      ).toBe(true);
      expect(Object.getPrototypeOf(encrypted)).toBe(Object.prototype);
    });

    it('never pollutes Object.prototype', () => {
      const original = JSON.parse(
        '{"__proto__": {"polluted": "yes"}}',
      ) as JsonObject;

      service.decryptPayload(service.encryptPayload(original));

      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
  });
});
