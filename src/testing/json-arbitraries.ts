import fc from 'fast-check';
import type { JsonObject, JsonValue } from '../common/json/json.types';

/**
 * Fixed seed and run count: fast-check draws its samples deterministically
 * from these, so every run — local or CI — exercises the exact same inputs
 * and a failure always reproduces.
 */
export const FC_CONFIG = { seed: 42, numRuns: 200 };

/**
 * Object keys the implementations are known to be sensitive to, mixed into
 * the generated ones rather than left to chance:
 * - `__proto__`/`constructor` would silently vanish (or reassign the
 *   prototype) under a plain `target[key] = value`;
 * - `""` is a legal but easily forgotten key;
 * - array-index-like keys are enumerated in ascending numeric order by the
 *   engine, which `canonicalize` must not inherit.
 */
const EDGE_KEYS = ['__proto__', 'constructor', 'toString', '', '1', '2', '10'];

/**
 * Strings the implementations are known to be sensitive to: the two Unicode
 * spellings of the same perceived text (no NFC normalization is applied), a
 * multi-code-point grapheme, and a plaintext that is simultaneously valid
 * Base64, UTF-8 and JSON.
 */
const EDGE_STRINGS = ['', 'caf\u00e9', 'cafe\u0301', '日本語', '👩‍👩‍👧‍👦', 'MzA='];

export const jsonKeyArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.constantFrom(...EDGE_KEYS),
);

export const jsonStringArbitrary: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.string({ unit: 'grapheme' }),
  fc.constantFrom(...EDGE_STRINGS),
);

/**
 * `-0` is excluded: `JSON.stringify(-0)` produces `"0"`, so the sign is lost
 * on any round-trip through JSON — a format limitation, not a bug.
 */
export const jsonNumberArbitrary: fc.Arbitrary<number> = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .filter((n) => !Object.is(n, -0));

export const jsonValueArbitrary: fc.Arbitrary<JsonValue> = fc.letrec<{
  value: JsonValue;
}>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    fc.integer(),
    jsonNumberArbitrary,
    jsonStringArbitrary,
    fc.array(tie('value'), { maxLength: 5 }),
    fc.dictionary(jsonKeyArbitrary, tie('value'), { maxKeys: 5 }),
  ),
})).value;

/** A JSON object whose property values are all drawn from `arbitrary`. */
export function objectOf<T extends JsonValue>(
  arbitrary: fc.Arbitrary<T>,
): fc.Arbitrary<JsonObject> {
  return fc.dictionary(jsonKeyArbitrary, arbitrary, {
    minKeys: 1,
    maxKeys: 5,
  });
}

const nestedObjectArbitrary: fc.Arbitrary<JsonObject> = fc.dictionary(
  jsonKeyArbitrary,
  fc.dictionary(
    jsonKeyArbitrary,
    fc.dictionary(jsonKeyArbitrary, jsonValueArbitrary, { maxKeys: 3 }),
    { maxKeys: 3 },
  ),
  { minKeys: 1, maxKeys: 3 },
);

/**
 * One arbitrary per JSON type. Tests iterate over this list with
 * `describe.each`/`it.each` so that every type is exercised on every run:
 * a single `fc.oneof` could leave a whole branch undrawn.
 */
export const typedArbitraries: ReadonlyArray<
  [name: string, arbitrary: fc.Arbitrary<JsonValue>]
> = [
  ['null', fc.constant(null)],
  ['boolean', fc.boolean()],
  ['integer', fc.integer()],
  ['double', jsonNumberArbitrary],
  ['string', jsonStringArbitrary],
  ['array', fc.array(jsonValueArbitrary, { minLength: 1, maxLength: 5 })],
  ['object', objectOf(jsonValueArbitrary)],
  ['nested object', nestedObjectArbitrary],
];

/**
 * Same per-type coverage, but always wrapped in an object: `/encrypt`,
 * `/decrypt` and the key-order invariants only apply to an object root.
 */
export const typedObjectArbitraries: ReadonlyArray<
  [name: string, arbitrary: fc.Arbitrary<JsonObject>]
> = typedArbitraries.map(([name, arbitrary]) => [
  `object of ${name}`,
  objectOf(arbitrary),
]);
