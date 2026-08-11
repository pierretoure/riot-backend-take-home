import type { JsonValue } from './json.types';

/**
 * Serializes a `JsonValue` into a canonical string form following RFC 8785
 * (JSON Canonicalization Scheme / JCS), with one deliberate deviation: no
 * Unicode NFC normalization is applied. Output is therefore NOT
 * interoperable with a strict JCS implementation for inputs containing
 * decomposed Unicode — see the deviation note at the end of this block.
 *
 * Rules applied:
 * - Object keys are sorted lexicographically by UTF-16 code unit, at every
 *   level of nesting. JavaScript's default `Array.prototype.sort()` on
 *   strings already compares by UTF-16 code unit, so no custom comparator
 *   (and in particular no `localeCompare`, which is locale-dependent) is
 *   used.
 * - Array order is strictly preserved: an array is ordered data, not a set.
 *   Its elements are canonicalized recursively but never reordered.
 * - `null` is preserved as a value in its own right, distinct from an
 *   absent property (`{"a":null}` !== `{}`).
 * - Number, string and boolean literals are serialized via `JSON.stringify`,
 *   which fixes their representation (ES6 `Number::toString` semantics for
 *   numbers, standard JSON escaping for strings).
 * - Object and array containers are serialized manually (see below), rather
 *   than by handing a re-ordered plain object to `JSON.stringify`.
 *
 * Why manual container serialization is required: per the ECMAScript
 * specification, own property keys that look like array indices (e.g.
 * `"2"`, `"10"`) are always enumerated in ascending *numeric* order by the
 * engine, before any other string keys, regardless of insertion order. This
 * applies to `Object.keys` and therefore also to `JSON.stringify`. Building
 * a plain JS object with keys re-inserted in sorted order and then calling
 * `JSON.stringify` on it would silently undo that sort for any numeric-like
 * keys. Serializing the `{...}` string directly from our own explicitly
 * sorted key array sidesteps this engine behavior entirely.
 *
 * Documented deviation from strict RFC 8785: no Unicode NFC normalization
 * is applied to strings. Two different Unicode representations of the same
 * perceived character therefore produce two different canonical outputs.
 * This is an accepted trade-off here, since the signer and verifier are the
 * same service and never exchange raw Unicode-ambiguous input across a
 * normalization boundary.
 */
export function canonicalize(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        const propertyValue = value[key];
        // `Object.keys` only ever returns own enumerable keys, so this
        // lookup always succeeds; the `undefined` fallback only exists to
        // satisfy `noUncheckedIndexedAccess` and is unreachable for
        // well-formed `JsonObject` values.
        return `${JSON.stringify(key)}:${canonicalize(propertyValue ?? null)}`;
      });

    return `{${entries.join(',')}}`;
  }

  // Primitives (string, number, boolean, null).
  return JSON.stringify(value);
}
