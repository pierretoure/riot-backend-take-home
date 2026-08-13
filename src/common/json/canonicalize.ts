import { JsonCanonicalizationError } from './canonicalize.error';
import type { JsonValue } from './json.types';

/**
 * Serializes a `JsonValue` into the canonical string form defined by
 * RFC 8785 (JSON Canonicalization Scheme / JCS).
 *
 * The implementation is organized to mirror the RFC's own rule families;
 * each one is restated at the point of the code that enforces it. Summary,
 * with how each rule is honored:
 *
 * §1 — Input syntax and values (I-JSON, RFC 7493)
 *   - Only the six JSON types are accepted. `undefined`, functions, symbols
 *     and bigints are language-specific values with no JSON counterpart and
 *     raise `JsonCanonicalizationError`, rather than being silently dropped
 *     the way `JSON.stringify` would.
 *   - Duplicate property names are forbidden. They cannot be observed from
 *     here — by the time a JS object exists, `JSON.parse` has already
 *     collapsed them (last one wins). The rule is therefore enforced one
 *     layer up, on the raw request body: see `assert-strict-json-body.ts`.
 *
 * §2 — Whitespace and structure
 *   - No insignificant whitespace whatsoever, and `,` / `:` as the only
 *     structural separators. Guaranteed by assembling containers by hand
 *     (see the "manual container serialization" note below).
 *
 * §3 — Object key ordering
 *   - Keys are sorted by UTF-16 code unit at every level of nesting.
 *
 * §4 — String serialization
 *   - Strings are preserved verbatim; no Unicode normalization.
 *   - Minimal escaping, short escapes where they exist, lowercase `\uXXXX`
 *     otherwise, and no superfluous escapes.
 *   - Lone surrogates are rejected.
 *
 * §5 — Number serialization
 *   - ECMAScript `Number::toString` semantics, `-0` collapsed to `0`.
 *   - `NaN` and `Infinity` are rejected.
 *
 * §6 — Output encoding
 *   - The canonical form is a sequence of UTF-8 bytes. This function
 *     returns a JavaScript string (UTF-16 in memory); the UTF-8 encoding
 *     happens at the single point where those bytes matter, when the string
 *     is fed to the HMAC — see `HmacSha256Signer`, which passes `'utf8'`
 *     explicitly for that reason.
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
 * @throws {JsonCanonicalizationError} when the input violates a JCS rule
 * that the RFC requires to be reported as an error rather than serialized.
 */
export function canonicalize(value: JsonValue): string {
  // --- RFC 8785 §3.2.3, arrays -------------------------------------------
  // Array order is strictly preserved: an array is ordered data, not a set.
  // Elements are canonicalized recursively but never reordered. Elements are
  // joined by `,` with no surrounding whitespace (§2).
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  // --- RFC 8785 §3.2.3, objects ------------------------------------------
  if (value !== null && typeof value === 'object') {
    // Sorting: property names are compared as arrays of UTF-16 code
    // units, treated as unsigned integers. `Array.prototype.sort()` with no
    // comparator compares strings exactly that way, so it is the correct
    // primitive here and not merely a convenient default. `localeCompare` is
    // explicitly ruled out: it is locale-dependent and would make signatures
    // depend on the host's ICU configuration.
    //
    // Consequence worth stating, since it surprises: characters outside the
    // BMP (emoji, historic scripts) are compared through their two surrogate
    // code units, so the resulting order differs from a sort by Unicode code
    // point. A BMP character in the range U+E000..U+FFFF sorts *after* a
    // supplementary character, because the latter starts with a high
    // surrogate (U+D800..U+DBFF). This is the JCS-mandated order.
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        // Keys are strings and follow the §4 string rules like any other.
        assertNoLoneSurrogate(key, 'Object key');

        // `Object.keys` only ever returns own enumerable keys, so this
        // lookup always succeeds at runtime; the non-null assertion of the
        // type system is replaced by the explicit type check performed by
        // the recursive call, which rejects `undefined` outright rather
        // than coercing it to `null`.
        return `${JSON.stringify(key)}:${canonicalize(value[key] as JsonValue)}`;
      });

    // `:` between name and value, `,` between members, no whitespace (§2).
    return `{${entries.join(',')}}`;
  }

  // --- RFC 8785 §3.2.1, literals -----------------------------------------
  // `null`, `true` and `false` have a single possible representation.
  if (value === null || typeof value === 'boolean') {
    // `null` is a value in its own right, distinct from an absent property:
    // `{"a":null}` and `{}` canonicalize differently and therefore carry
    // different signatures.
    return JSON.stringify(value);
  }

  // --- RFC 8785 §3.2.2.3, numbers ----------------------------------------
  if (typeof value === 'number') {
    // NaN and Infinity have no JSON representation. `JSON.stringify` turns
    // them into the string `"null"`, which would silently sign a payload
    // that never round-trips; the RFC requires terminating with an error.
    // This is reachable from real input: `JSON.parse('{"a":1e400}')` yields
    // `Infinity` without complaining.
    if (!Number.isFinite(value)) {
      throw new JsonCanonicalizationError(
        'Number is not finite (NaN and Infinity are forbidden by RFC 8785)',
      );
    }

    // Everything else about number formatting is delegated to
    // `JSON.stringify`, which is exactly right rather than merely
    // convenient: RFC 8785 §3.2.2.3 defines number serialization *as* the
    // ECMAScript `Number::toString` algorithm on IEEE-754 binary64 values,
    // which is what V8 implements. That single delegation covers, for free,
    // every formatting rule the RFC lists:
    //   - integers carry no decimal point       (1.0  -> "1")
    //   - no leading zeros                      (01   is not producible)
    //   - no trailing fractional zeros          (1.200 -> "1.2")
    //   - exponent notation only outside the range 1e-7 .. 1e21, and
    //     spelled the ECMAScript way            (1e21 -> "1e+21")
    //   - minus zero loses its sign             (-0   -> "0")
    // Precision is bounded by binary64, as the RFC requires; values beyond
    // 2^53 lose fidelity on the way in, during `JSON.parse`, not here.
    return JSON.stringify(value);
  }

  // --- RFC 8785 §3.2.2.2, strings ----------------------------------------
  if (typeof value === 'string') {
    assertNoLoneSurrogate(value, 'String value');

    // String data is preserved *as is*. RFC 8785 does not merely permit
    // this, it requires it: "All components involved MUST preserve Unicode
    // string data 'as is'". Applying NFC or NFD here would be a violation,
    // not an improvement. The practical consequence is specified behavior,
    // not a limitation: a precomposed "é" (U+00E9) and its decomposed form
    // (U+0065 U+0301) are different data and produce different signatures.
    //
    // The escaping itself is delegated to `JSON.stringify`, whose output
    // matches the JCS rules exactly:
    //   - `"` and `\` are escaped as `\"` and `\\`, and nothing else is
    //     escaped that does not have to be (`/` stays literal, letters stay
    //     literal — no gratuitous `b` for `b`);
    //   - C0 control characters use the short forms `\b \t \n \f \r` where
    //     they exist, and lowercase `\uXXXX` otherwise;
    //   - all other characters, including non-ASCII ones, are emitted
    //     literally rather than escaped.
    // The one place `JSON.stringify` diverges from JCS is lone surrogates:
    // since ES2019 ("well-formed JSON.stringify") it escapes them into
    // `\udXXX` instead of failing, whereas the RFC requires an error. Hence
    // the explicit check above.
    return JSON.stringify(value);
  }

  // --- RFC 8785 §1, I-JSON input constraint ------------------------------
  // Anything left is a language-specific value with no JSON counterpart:
  // `undefined`, a function, a symbol, a bigint. `JSON.stringify` returns
  // the *value* `undefined` for the first three, which template-literal
  // interpolation would turn into the literal text `undefined` inside an
  // otherwise well-formed canonical string, and throws an opaque TypeError
  // for bigint. Reject explicitly instead.
  //
  // The `JsonValue` type already forbids these, so this branch is
  // unreachable for type-checked callers. It is kept because the boundary
  // that actually matters is untyped: request bodies arrive as `unknown`,
  // and a cast is all that stands between them and this function.
  throw new JsonCanonicalizationError(
    `Value of type "${typeof value}" is not valid JSON and cannot be canonicalized`,
  );
}

/**
 * Rejects strings containing an unpaired surrogate code unit.
 *
 * RFC 8785 §3.2.2.2: "Invalid Unicode data like 'lone surrogates' MUST
 * cause a compliant JCS implementation to terminate with an appropriate
 * error." Such a string cannot be encoded as UTF-8 (§6), so there is no
 * canonical byte sequence to produce.
 *
 * These are reachable through escape sequences — `JSON.parse('"\\ud800"')`
 * succeeds and yields a lone high surrogate — even though a raw UTF-8
 * request body could never carry one.
 */
function assertNoLoneSurrogate(value: string, subject: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);

    // Not a surrogate code unit at all: nothing to check.
    if (unit < 0xd800 || unit > 0xdfff) {
      continue;
    }

    // A low surrogate here was not consumed as the second half of a pair by
    // a preceding high surrogate, so it stands alone.
    if (unit >= 0xdc00) {
      throw new JsonCanonicalizationError(
        `${subject} contains a lone low surrogate at index ${index}`,
      );
    }

    // High surrogate: valid only when immediately followed by a low one.
    const next = value.charCodeAt(index + 1);
    if (!(next >= 0xdc00 && next <= 0xdfff)) {
      throw new JsonCanonicalizationError(
        `${subject} contains a lone high surrogate at index ${index}`,
      );
    }

    // Skip the low surrogate: it is part of this valid pair.
    index += 1;
  }
}
