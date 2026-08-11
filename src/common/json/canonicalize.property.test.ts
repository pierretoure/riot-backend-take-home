import fc from 'fast-check';
import { canonicalize } from './canonicalize';
import { shuffleKeysDeep } from '../../testing/shuffle-keys-deep';
import type { JsonValue } from './json.types';

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

// Fixed seed and run count: fast-check draws its samples deterministically
// from these, so the exact same inputs are exercised on every run and every
// machine (CI failures reproduce locally instead of depending on which
// random sample happened to be drawn that run).
const FC_CONFIG = { seed: 42, numRuns: 500 };

/**
 * Deterministic PRNG seeded from a fast-check integer, so key shuffling is
 * reproducible for a given seed.
 */
function seededRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Curated fixtures covering the scenarios called out during review, tested
 * directly (independently of the randomized fast-check properties) so they
 * are guaranteed to run rather than left to chance.
 */
const curatedFixtures: { name: string; value: JsonValue }[] = [
  {
    name: 'deeply nested object',
    value: { a: { b: { c: { d: { e: 1 } } } } },
  },
  {
    name: 'array of objects with unordered keys',
    value: [
      { b: 1, a: 2 },
      { d: 3, c: 4 },
    ],
  },
  {
    name: 'unicode string keys and values',
    value: { é: 'ü', ü: 'é', Z: 'z' },
  },
  { name: 'empty string key and value', value: { '': '' } },
  { name: 'null value', value: { a: null } },
  { name: 'absent key (no "a" property)', value: {} },
  { name: 'negative number', value: -42 },
  { name: 'floating point number', value: 3.14159 },
  { name: 'integer', value: 7 },
  { name: 'boolean true', value: true },
  { name: 'boolean false', value: false },
  { name: 'empty object', value: {} },
  { name: 'empty array', value: [] },
  {
    name: 'numeric-like keys ("1", "2", "10")',
    value: { '10': 'ten', '2': 'two', '1': 'one' },
  },
];

describe('canonicalize (property-based)', () => {
  it('is invariant to key order at every nesting level', () => {
    fc.assert(
      fc.property(jsonValueArbitrary, fc.integer(), (value, seed) => {
        const shuffled = shuffleKeysDeep(value, seededRng(seed));

        expect(canonicalize(value)).toBe(canonicalize(shuffled));
      }),
      FC_CONFIG,
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
      FC_CONFIG,
    );
  });

  describe('curated fixtures', () => {
    it.each(curatedFixtures)(
      'is invariant to key order for: $name',
      ({ value }) => {
        const shuffled = shuffleKeysDeep(value, seededRng(1));

        expect(canonicalize(value)).toBe(canonicalize(shuffled));
      },
    );

    it('produces a different canonical form for every pair of structurally different fixtures', () => {
      for (let i = 0; i < curatedFixtures.length; i += 1) {
        for (let j = i + 1; j < curatedFixtures.length; j += 1) {
          const a = curatedFixtures[i];
          const b = curatedFixtures[j];
          if (
            a === undefined ||
            b === undefined ||
            deepEqual(a.value, b.value)
          ) {
            continue;
          }

          expect(canonicalize(a.value)).not.toBe(canonicalize(b.value));
        }
      }
    });
  });
});
