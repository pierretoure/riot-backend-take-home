import { canonicalize } from './canonicalize';
import { JsonCanonicalizationError } from './canonicalize.error';
import type { JsonValue } from './json.types';

/**
 * Builds a string from raw UTF-16 code units.
 *
 * Used instead of literal characters wherever the exact code units matter
 * (surrogates, control characters, precomposed vs. decomposed forms): a
 * literal would depend on how this source file happens to be encoded and
 * displayed, which is precisely what these tests must not depend on.
 */
const units = (...codes: number[]): string => String.fromCharCode(...codes);

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

  describe('RFC 8785 §3.2.3 — key sorting by UTF-16 code unit', () => {
    it('reproduces the sorting example from the specification', () => {
      // The RFC's own test vector. Its point is that supplementary-plane
      // characters sort by their surrogate code units, not by code point:
      // U+1F600 (😀, high surrogate D83D) lands *before* U+FB33 (דּ) even
      // though its code point is far higher.
      const input: JsonValue = {
        [units(0x20ac)]: 'Euro Sign',
        [units(0x0d)]: 'Carriage Return',
        [units(0xfb33)]: 'Hebrew Letter Dalet With Dagesh',
        '1': 'One',
        [units(0xd83d, 0xde00)]: 'Emoji: Grinning Face',
        [units(0x80)]: 'Control',
        [units(0xf6)]: 'Latin Small Letter O With Diaeresis',
      };

      const values = [...canonicalize(input).matchAll(/:"([^"]+)"/g)].map(
        (match) => match[1],
      );

      expect(values).toStrictEqual([
        'Carriage Return', // U+000D
        'One', // U+0031
        'Control', // U+0080
        'Latin Small Letter O With Diaeresis', // U+00F6
        'Euro Sign', // U+20AC
        'Emoji: Grinning Face', // U+D83D U+DE00
        'Hebrew Letter Dalet With Dagesh', // U+FB33
      ]);
    });

    it('orders a supplementary-plane key before a high BMP key', () => {
      // Isolated restatement of the surprising half of the rule above: sorting
      // by code point would put U+FB33 first.
      const input: JsonValue = {
        [units(0xfb33)]: 'bmp',
        [units(0xd83d, 0xde00)]: 'supplementary',
      };

      expect(canonicalize(input)).toBe(
        `{"${units(0xd83d, 0xde00)}":"supplementary","${units(0xfb33)}":"bmp"}`,
      );
    });
  });

  describe('RFC 8785 §3.2.2.2 — string serialization', () => {
    it('escapes only the quote and the backslash among printable characters', () => {
      // The solidus is valid to escape in JSON but must not be escaped here:
      // JCS forbids gratuitous escapes.
      expect(canonicalize('a/b"c\\d')).toBe('"a/b\\"c\\\\d"');
    });

    it('uses the short escapes for control characters that have one', () => {
      expect(canonicalize(units(0x08, 0x0c, 0x0a, 0x0d, 0x09))).toBe(
        '"\\b\\f\\n\\r\\t"',
      );
    });

    it('uses lowercase \\uXXXX for control characters without a short escape', () => {
      expect(canonicalize(units(0x00, 0x1f))).toBe('"\\u0000\\u001f"');
    });

    it('emits non-ASCII characters literally rather than escaped', () => {
      // U+0080 is a C1 control: outside the C0 range, so not escaped.
      expect(canonicalize(units(0x80, 0xe9))).toBe(`"${units(0x80, 0xe9)}"`);
    });

    it('preserves Unicode as is, applying no NFC or NFD normalization', () => {
      // Required by the RFC ("MUST preserve Unicode string data 'as is'"),
      // not a shortcut: precomposed and decomposed are different data.
      const precomposed = units(0xe9); // é
      const decomposed = units(0x65, 0x301); // e + combining acute

      expect(precomposed.normalize('NFC')).toBe(decomposed.normalize('NFC'));
      expect(canonicalize(precomposed)).not.toBe(canonicalize(decomposed));
      expect(canonicalize(precomposed)).toBe(`"${precomposed}"`);
    });

    it('accepts a well-formed surrogate pair', () => {
      expect(canonicalize(units(0xd83d, 0xde00))).toBe(
        `"${units(0xd83d, 0xde00)}"`,
      );
    });

    it.each([
      ['lone high surrogate', units(0xd800)],
      ['lone low surrogate', units(0xdc00)],
      ['high surrogate followed by a non-surrogate', units(0xd800, 0x41)],
      ['reversed surrogate pair', units(0xdc00, 0xd800)],
      ['high surrogate at the end of the string', units(0x41, 0xd83d)],
    ])('rejects a string containing a %s', (_label, value) => {
      // `JSON.stringify` would escape these into \udXXX instead of failing;
      // the RFC requires terminating with an error.
      expect(() => canonicalize(value)).toThrow(JsonCanonicalizationError);
    });

    it('rejects a lone surrogate in a property name', () => {
      expect(() => canonicalize({ [units(0xd800)]: 1 })).toThrow(
        JsonCanonicalizationError,
      );
    });

    it('rejects a lone surrogate nested inside an array', () => {
      expect(() => canonicalize({ a: [1, { b: units(0xdc00) }] })).toThrow(
        JsonCanonicalizationError,
      );
    });
  });

  describe('RFC 8785 §3.2.2.3 — number serialization', () => {
    it.each([
      ['1e21 as the ECMAScript exponent form', 1e21, '1e+21'],
      [
        '1e20 in full, below the exponent threshold',
        1e20,
        '100000000000000000000',
      ],
      ['1e-7 as the ECMAScript exponent form', 1e-7, '1e-7'],
      ['1e-6 in full, above the exponent threshold', 1e-6, '0.000001'],
      ['a trailing fractional zero removed', 1.2, '1.2'],
      ['the maximum safe integer', 9007199254740991, '9007199254740991'],
    ])('serializes %s', (_label, value, expected) => {
      expect(canonicalize(value)).toBe(expected);
    });

    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
    ])('rejects %s instead of serializing it as null', (_label, value) => {
      // `JSON.stringify` yields the string "null" for all three, which would
      // silently sign a payload that cannot round-trip.
      expect(() => canonicalize(value)).toThrow(JsonCanonicalizationError);
    });

    it('rejects a non-finite number reachable from parsed input', () => {
      // The realistic path: an overflowing literal in a request body.
      const parsed = JSON.parse('{"a":1e400}') as JsonValue;

      expect(() => canonicalize(parsed)).toThrow(JsonCanonicalizationError);
    });
  });

  describe('RFC 8785 §1 — I-JSON input constraint', () => {
    it.each([
      ['undefined', undefined],
      ['a function', (): void => undefined],
      ['a symbol', Symbol('nope')],
      ['a bigint', 10n],
    ])('rejects %s as a root value', (_label, value) => {
      expect(() => canonicalize(value as unknown as JsonValue)).toThrow(
        JsonCanonicalizationError,
      );
    });

    it('rejects undefined as a property value rather than coercing it to null', () => {
      const input = { a: undefined } as unknown as JsonValue;

      expect(() => canonicalize(input)).toThrow(JsonCanonicalizationError);
    });

    it('rejects undefined as an array element rather than coercing it to null', () => {
      const input = [1, undefined, 3] as unknown as JsonValue;

      expect(() => canonicalize(input)).toThrow(JsonCanonicalizationError);
    });
  });
});
