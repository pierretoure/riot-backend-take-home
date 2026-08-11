import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/json/json.types';
import { CIPHER, type Cipher } from './ports/cipher.port';

/**
 * Maximum number of top-level (depth 1) properties accepted by
 * `encryptPayload`/`decryptPayload`. The 100kb global body size limit
 * already bounds total payload bytes; this bounds *property count*
 * specifically, guarding against a payload that is small in bytes but
 * pathologically wide (e.g. tens of thousands of single-character keys),
 * which would otherwise force an equally large amount of per-property work.
 */
export const MAX_TOP_LEVEL_PROPERTIES = 1000;

/**
 * Maximum nesting depth accepted for any single property value. A
 * primitive value has depth 1; each level of object/array nesting adds 1.
 *
 * This exists because `JSON.stringify` (used by `encryptPayload`) is
 * implemented recursively in V8 and throws a `RangeError: Maximum call
 * stack size exceeded` — not a catchable "bad input" error — on
 * sufficiently deep structures. Such a structure can be made to fit well
 * within the 100kb body limit (e.g. `{"a":{"a":{"a":...}}}` repeated tens
 * of thousands of times), so byte-size alone does not protect against it.
 * 32 levels comfortably covers any realistic payload (the encryption model
 * itself only ever inspects depth 1) while stopping pathological input long
 * before it could threaten the process.
 */
export const MAX_VALUE_DEPTH = 32;

/**
 * Computes the nesting depth of a `JsonValue`, iteratively (an explicit
 * stack, not recursive calls) so that the depth check itself can never
 * stack-overflow on the very input it is meant to reject. Bails out as soon
 * as `limit` is exceeded, returning `limit + 1`, rather than walking the
 * full structure.
 */
function computeDepth(root: JsonValue, limit: number): number {
  const stack: Array<{ value: JsonValue; depth: number }> = [
    { value: root, depth: 1 },
  ];
  let maxDepth = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }

    if (frame.depth > maxDepth) {
      maxDepth = frame.depth;
    }
    if (maxDepth > limit) {
      return maxDepth;
    }

    if (Array.isArray(frame.value)) {
      for (const element of frame.value) {
        stack.push({ value: element, depth: frame.depth + 1 });
      }
    } else if (frame.value !== null && typeof frame.value === 'object') {
      for (const key of Object.keys(frame.value)) {
        stack.push({ value: frame.value[key] ?? null, depth: frame.depth + 1 });
      }
    }
  }

  return maxDepth;
}

function assertSafeShape(payload: JsonObject): void {
  if (Object.keys(payload).length > MAX_TOP_LEVEL_PROPERTIES) {
    throw new BadRequestException(
      `Payload must not have more than ${MAX_TOP_LEVEL_PROPERTIES} top-level properties`,
    );
  }
}

function assertSafeDepth(value: JsonValue, propertyName: string): void {
  if (computeDepth(value, MAX_VALUE_DEPTH) > MAX_VALUE_DEPTH) {
    throw new BadRequestException(
      `Property "${propertyName}" is nested too deeply`,
    );
  }
}

@Injectable()
export class CryptoService {
  constructor(@Inject(CIPHER) private readonly cipher: Cipher) {}

  /**
   * Adds an own enumerable property to `target`.
   *
   * Plain assignment (`target[key] = value`) cannot be used: for the key
   * `__proto__`, it invokes the `Object.prototype` setter and reassigns the
   * target's prototype instead of creating a property. With a string value
   * the assignment is silently ignored, so `{"__proto__": …}` would vanish
   * from the payload and break the round-trip guarantee; with an object
   * value it would replace the result's prototype. `defineProperty` treats
   * every key as ordinary data.
   */
  private static define(
    target: JsonObject,
    key: string,
    value: JsonValue,
  ): void {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  /**
   * Encrypts every depth-1 property: `cipher.encrypt(JSON.stringify(value))`.
   * `JSON.stringify` is applied unconditionally, strings included, which is
   * what allows `decryptPayload` to restore the original type.
   */
  encryptPayload(payload: JsonObject): JsonObject {
    assertSafeShape(payload);

    const result: JsonObject = {};
    for (const key of Object.keys(payload)) {
      const value = payload[key] ?? null;
      assertSafeDepth(value, key);
      CryptoService.define(
        result,
        key,
        this.cipher.encrypt(JSON.stringify(value)),
      );
    }

    return result;
  }

  /**
   * Decrypts every depth-1 property that `cipher.looksEncrypted` detects as
   * ciphertext; any other value is left strictly unchanged (e.g. a plain
   * `birth_date` string, per the subject's example).
   */
  decryptPayload(payload: JsonObject): JsonObject {
    assertSafeShape(payload);

    const result: JsonObject = {};
    for (const key of Object.keys(payload)) {
      const value = payload[key] ?? null;

      if (typeof value === 'string' && this.cipher.looksEncrypted(value)) {
        const decoded = this.cipher.decrypt(value);
        const parsed: unknown = JSON.parse(decoded);
        const parsedValue = parsed as JsonValue;
        assertSafeDepth(parsedValue, key);
        CryptoService.define(result, key, parsedValue);
      } else {
        // Pass-through values are not re-serialized here, but they will be
        // by Express's `res.json()` when the response is sent — the same
        // `JSON.stringify` stack-overflow risk documented above applies, so
        // the depth guard is enforced here too.
        assertSafeDepth(value, key);
        CryptoService.define(result, key, value);
      }
    }

    return result;
  }
}
