import type { JsonObject, JsonValue } from '../common/json/json.types';

/**
 * Returns a structurally identical copy of `value` with the key insertion
 * order of every nested object randomised, driven by the supplied
 * deterministic RNG.
 *
 * This is the oracle behind the "property order does not matter" properties
 * of `canonicalize` and of the signature service: the copy must differ from
 * the input *only* in key order. It therefore has to be lossless — including
 * for the key `__proto__`, where a plain `result[key] = …` would invoke the
 * `Object.prototype` setter and silently drop the property, making the
 * oracle wrong and the property tests intermittently fail on a correct
 * implementation.
 */
export function shuffleKeysDeep(
  value: JsonValue,
  rng: () => number,
): JsonValue {
  if (Array.isArray(value)) {
    // Array order is meaningful and must never be shuffled.
    return value.map((element) => shuffleKeysDeep(element, rng));
  }

  if (value !== null && typeof value === 'object') {
    const keys = [...Object.keys(value)];

    // Fisher-Yates, using the caller's RNG so failures are reproducible.
    for (let i = keys.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const a = keys[i];
      const b = keys[j];
      if (a !== undefined && b !== undefined) {
        keys[i] = b;
        keys[j] = a;
      }
    }

    const result: JsonObject = {};
    for (const key of keys) {
      const original = value[key];
      if (original !== undefined) {
        Object.defineProperty(result, key, {
          value: shuffleKeysDeep(original, rng),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    return result;
  }

  return value;
}
