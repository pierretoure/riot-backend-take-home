import { canonicalize } from './canonicalize';
import type { JsonValue } from './json.types';

describe('canonicalize', () => {
  it('sorts the keys of a flat object', () => {
    const input: JsonValue = { b: 1, a: 2, c: 3 };

    expect(canonicalize(input)).toBe('{"a":2,"b":1,"c":3}');
  });

  it('sorts keys recursively across deeply nested objects (3+ levels)', () => {
    const input: JsonValue = {
      z: {
        y: {
          d: 1,
          b: 2,
          c: {
            z: 'end',
            a: 'start',
          },
        },
        a: true,
      },
      a: 1,
    };

    expect(canonicalize(input)).toBe(
      '{"a":1,"z":{"a":true,"y":{"b":2,"c":{"a":"start","z":"end"},"d":1}}}',
    );
  });

  it('sorts object keys inside array elements while preserving array order', () => {
    const input: JsonValue = [
      { b: 1, a: 2 },
      { d: 3, c: 4 },
    ];

    expect(canonicalize(input)).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });

  it('never reorders array elements', () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
    expect(canonicalize([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalize([3, 2, 1])).toBe('[3,2,1]');
  });

  it('distinguishes an explicit null property from an absent one', () => {
    expect(canonicalize({ a: null })).not.toBe(canonicalize({}));
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(canonicalize({})).toBe('{}');
  });

  describe('numbers', () => {
    it('serializes integers and their float-equal literal identically', () => {
      // 1 and 1.0 are the same JS number; canonicalize must be deterministic.
      expect(canonicalize(1)).toBe(canonicalize(1.0));
      expect(canonicalize(1)).toBe('1');
    });

    it('serializes negative numbers', () => {
      expect(canonicalize(-42)).toBe('-42');
    });

    it('serializes floating point numbers', () => {
      expect(canonicalize(3.14159)).toBe('3.14159');
    });

    it('serializes zero and negative zero via JSON.stringify semantics', () => {
      expect(canonicalize(0)).toBe('0');
      // JSON.stringify(-0) is "0": canonicalize must not deviate from that.
      expect(canonicalize(-0)).toBe('0');
    });
  });

  describe('strings', () => {
    it('handles empty string values', () => {
      expect(canonicalize('')).toBe('""');
      expect(canonicalize({ a: '' })).toBe('{"a":""}');
    });

    it('handles empty string keys', () => {
      expect(canonicalize({ '': 'value', a: 'other' })).toBe(
        '{"":"value","a":"other"}',
      );
    });
  });

  it('sorts unicode keys by UTF-16 code unit', () => {
    const input: JsonValue = { é: 1, a: 2, ü: 3, Z: 4 };

    // UTF-16 code unit order: 'Z' (0x5A) < 'a' (0x61) < 'é' (0xE9) < 'ü' (0xFC)
    expect(canonicalize(input)).toBe('{"Z":4,"a":2,"é":1,"ü":3}');
  });

  it('sorts numeric-looking keys deterministically as strings', () => {
    const input: JsonValue = { '10': 'ten', '2': 'two', '1': 'one' };

    // Even though JS engines enumerate integer-like keys in ascending
    // numeric order by default, canonicalize must apply its own explicit
    // lexicographic sort so the result does not depend on engine behavior:
    // "1" < "10" < "2" lexicographically.
    expect(canonicalize(input)).toBe('{"1":"one","10":"ten","2":"two"}');
  });

  describe('non-object root values', () => {
    it('canonicalizes a root string', () => {
      expect(canonicalize('hello')).toBe('"hello"');
    });

    it('canonicalizes a root number', () => {
      expect(canonicalize(42)).toBe('42');
    });

    it('canonicalizes a root boolean', () => {
      expect(canonicalize(true)).toBe('true');
      expect(canonicalize(false)).toBe('false');
    });

    it('canonicalizes a root null', () => {
      expect(canonicalize(null)).toBe('null');
    });

    it('canonicalizes a root array', () => {
      expect(canonicalize([1, 'a', null])).toBe('[1,"a",null]');
    });
  });

  it('canonicalizes an empty object', () => {
    expect(canonicalize({})).toBe('{}');
  });

  it('canonicalizes an empty array', () => {
    expect(canonicalize([])).toBe('[]');
  });
});
