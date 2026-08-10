import fc from 'fast-check';
import { ConfigService } from '@nestjs/config';
import { HmacSha256Signer } from './adapters/hmac-sha256.signer';
import { SignatureService } from './signature.service';
import { shuffleKeysDeep } from '../testing/shuffle-keys-deep';
import type { JsonObject, JsonValue } from '../common/json/json.types';

/**
 * Arbitrary producing varied JSON values, mirroring the generator used for
 * `canonicalize` (unicode strings, empty strings, negative/float numbers,
 * `null`, booleans, arrays, nested objects) — see cahier des charges §10.
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
      { maxKeys: 5 },
    ),
  ),
})).value;

/** Only objects and non-empty arrays can be mutated while staying distinct. */
const jsonObjectArbitrary: fc.Arbitrary<JsonObject> = fc.dictionary(
  fc.string({ minLength: 1 }),
  jsonValueArbitrary,
  { minKeys: 1, maxKeys: 5 },
);

function makeService(): SignatureService {
  const signer = new HmacSha256Signer(
    new ConfigService({ HMAC_SECRET: 'a'.repeat(32) }),
  );
  return new SignatureService(signer);
}

describe('SignatureService (property-based)', () => {
  it('verify(x, sign(x)) is always true', () => {
    const service = makeService();

    fc.assert(
      fc.property(jsonValueArbitrary, (value) => {
        expect(service.verify(value, service.sign(value))).toBe(true);
      }),
    );
  });

  it('is invariant to property order at every nesting level', () => {
    const service = makeService();

    fc.assert(
      fc.property(jsonValueArbitrary, fc.integer(), (value, seed) => {
        let state = seed >>> 0 || 1;
        const rng = (): number => {
          state = (state * 1103515245 + 12345) & 0x7fffffff;
          return state / 0x7fffffff;
        };

        const shuffled = shuffleKeysDeep(value, rng);
        const signature = service.sign(value);

        expect(service.sign(shuffled)).toBe(signature);
        expect(service.verify(shuffled, signature)).toBe(true);
      }),
    );
  });

  it('invalidates the signature when the payload is mutated', () => {
    const service = makeService();

    fc.assert(
      fc.property(
        jsonObjectArbitrary,
        fc.string({ minLength: 1 }),
        fc.string(),
        (payload, extraKey, extraValue) => {
          // Ensure the mutation actually changes the payload: pick a key
          // guaranteed absent from the generated object.
          fc.pre(!Object.prototype.hasOwnProperty.call(payload, extraKey));

          const signature = service.sign(payload);
          const mutated: JsonObject = { ...payload, [extraKey]: extraValue };

          expect(service.verify(mutated, signature)).toBe(false);
        },
      ),
    );
  });
});
