import fc from 'fast-check';
import { canonicalize } from './canonicalize';
import {
  FC_CONFIG,
  jsonValueArbitrary,
  typedArbitraries,
  typedObjectArbitraries,
} from '../../testing/json-arbitraries';
import { seededRng } from '../../testing/seeded-rng';
import { shuffleKeysDeep } from '../../testing/shuffle-keys-deep';
import type { JsonValue } from './json.types';

/**
 * Structural equality reference (independent of key order), used to skip the
 * pairs that are structurally identical and could therefore not be expected
 * to canonicalize differently.
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

describe.each(typedObjectArbitraries)(
  'canonicalize — %s',
  (_name, arbitrary) => {
    it('is invariant to key order at every nesting level', () => {
      fc.assert(
        fc.property(arbitrary, fc.integer(), (value, seed) => {
          const shuffled = shuffleKeysDeep(value, seededRng(seed));

          expect(canonicalize(value)).toBe(canonicalize(shuffled));
        }),
        FC_CONFIG,
      );
    });
  },
);

describe.each(typedArbitraries)('canonicalize — %s', (_name, arbitrary) => {
  it('produces different canonical forms for structurally different values', () => {
    // The second value is drawn from the whole JSON space rather than from
    // the same arbitrary: a single-inhabitant type (`null`) would otherwise
    // never yield two distinct values and the precondition below would
    // reject every sample.
    fc.assert(
      fc.property(arbitrary, jsonValueArbitrary, (x, y) => {
        // Two independent draws can still be structurally identical; only
        // assert divergence once a reference deep-equality check confirms
        // they truly differ.
        fc.pre(!deepEqual(x, y));

        expect(canonicalize(x)).not.toBe(canonicalize(y));
      }),
      FC_CONFIG,
    );
  });
});
