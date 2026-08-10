import fc from 'fast-check';
import { canonicalize } from './canonicalize';
import type { JsonObject, JsonValue } from './json.types';

/**
 * Arbitrary producing varied JSON values: unicode strings, empty strings,
 * negative and floating point numbers, `null`, booleans, arrays, and deeply
 * nested objects.
 */
const jsonValueArbitrary: fc.Arbitrary<JsonValue> = fc.letrec<{
  value: JsonValue;
}>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.integer(),
    fc.string(),
    fc.string({ unit: 'grapheme' }),
    fc.array(tie('value'), { maxLength: 5 }),
    fc.dictionary(
      fc.oneof(fc.string(), fc.string({ unit: 'grapheme' })),
      tie('value'),
      {
        maxKeys: 5,
      },
    ),
  ),
})).value;

/**
 * Recursively shuffles object key order without changing their content, so
 * that we can assert canonicalize is insensitive to input key order at every
 * nesting level.
 */
function shuffleKeysDeep(value: JsonValue, rng: () => number): JsonValue {
  if (Array.isArray(value)) {
    return value.map((element) => shuffleKeysDeep(element, rng));
  }

  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    const shuffled = [...keys];

    // Fisher-Yates shuffle driven by the supplied deterministic RNG.
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const a = shuffled[i];
      const b = shuffled[j];
      if (a !== undefined && b !== undefined) {
        shuffled[i] = b;
        shuffled[j] = a;
      }
    }

    const result: JsonObject = {};
    for (const key of shuffled) {
      const original = value[key];
      if (original !== undefined) {
        result[key] = shuffleKeysDeep(original, rng);
      }
    }
    return result;
  }

  return value;
}

/**
 * Structural equality reference (independent of key order), used to detect
 * false positives when generating "different" values that might turn out to
 * be structurally identical (e.g. `1` and `1.0`, or the same object with
 * keys in a different order).
 */
function deepEqual(a: JsonValue, b: JsonValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((element, index) => {
      const other = b[index];
      return other !== undefined && deepEqual(element, other);
    });
  }

  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, index) => {
      const bKey = bKeys[index];
      if (bKey === undefined || key !== bKey) return false;
      const aValue = a[key];
      const bValue = b[bKey];
      return (
        aValue !== undefined &&
        bValue !== undefined &&
        deepEqual(aValue, bValue)
      );
    });
  }

  return Object.is(a, b);
}

describe('canonicalize (property-based)', () => {
  it('is invariant to key order at every nesting level', () => {
    fc.assert(
      fc.property(jsonValueArbitrary, fc.integer(), (value, seed) => {
        // Simple deterministic PRNG seeded from the fast-check integer,
        // so shuffling is reproducible for a given seed.
        let state = seed >>> 0 || 1;
        const rng = (): number => {
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };

        const shuffled = shuffleKeysDeep(value, rng);

        expect(canonicalize(value)).toBe(canonicalize(shuffled));
      }),
    );
  });

  it('produces different canonical forms for structurally different values', () => {
    fc.assert(
      fc.property(jsonValueArbitrary, jsonValueArbitrary, (x, y) => {
        // Guard against false positives: fast-check may generate two values
        // that are structurally identical (e.g. object key order aside) even
        // though they were drawn independently. Only assert divergence when
        // a reference deep-equality check confirms they truly differ.
        fc.pre(!deepEqual(x, y));

        expect(canonicalize(x)).not.toBe(canonicalize(y));
      }),
    );
  });
});
