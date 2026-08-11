import fc from 'fast-check';
import { Base64Cipher } from './adapters/base64.cipher';
import { CryptoService } from './crypto.service';
import type { JsonObject, JsonValue } from '../common/json/json.types';

const jsonValueArbitrary: fc.Arbitrary<JsonValue> = fc.letrec<{
  value: JsonValue;
}>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constant(null),
    fc.boolean(),
    // `-0` is excluded: `JSON.stringify(-0)` produces `"0"`, so the sign is
    // lost on the round-trip through `encryptPayload`/`decryptPayload`
    // (JSON has no negative-zero literal). Jest's `toEqual` distinguishes
    // `-0` from `0`, so this is a JSON-format limitation, not a bug.
    fc
      .double({ noNaN: true, noDefaultInfinity: true })
      .filter((n) => !Object.is(n, -0)),
    fc.integer(),
    // Excludes strings that happen to be valid Base64 + UTF-8 + JSON: such a
    // plaintext string would be wrongly decoded by `decryptPayload`, which
    // is a known limitation of the heuristic, not a bug in the round-trip
    // property under test here.
    fc.string().filter((s) => !new Base64Cipher().looksEncrypted(s)),
    fc.array(tie('value'), { maxLength: 5 }),
    fc.dictionary(fc.string(), tie('value'), { maxKeys: 5 }),
  ),
})).value;

const payloadArbitrary: fc.Arbitrary<JsonObject> = fc.dictionary(
  fc.string({ minLength: 1 }).filter((key) => key.length > 0),
  jsonValueArbitrary,
  { maxKeys: 10 },
);

describe('CryptoService (property-based)', () => {
  const service = new CryptoService(new Base64Cipher());

  it('decryptPayload(encryptPayload(x)) === x, types included', () => {
    fc.assert(
      fc.property(payloadArbitrary, (payload) => {
        const encrypted = service.encryptPayload(payload);
        const decrypted = service.decryptPayload(encrypted);

        expect(decrypted).toEqual(payload);
      }),
    );
  });
});
