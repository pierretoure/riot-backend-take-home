import fc from 'fast-check';
import { ConfigService } from '@nestjs/config';
import { HmacSha256Signer } from './adapters/hmac-sha256.signer';
import { SignatureService } from './signature.service';
import {
  FC_CONFIG,
  typedArbitraries,
  typedObjectArbitraries,
} from '../testing/json-arbitraries';
import { seededRng } from '../testing/seeded-rng';
import { shuffleKeysDeep } from '../testing/shuffle-keys-deep';
import type { JsonObject } from '../common/json/json.types';

function makeService(): SignatureService {
  const signer = new HmacSha256Signer(
    new ConfigService({ SIGNER_SECRET: 'a'.repeat(32) }),
  );
  return new SignatureService(signer);
}

describe.each(typedArbitraries)('SignatureService — %s', (_name, arbitrary) => {
  const service = makeService();

  it('verify(x, sign(x)) is always true', () => {
    fc.assert(
      fc.property(arbitrary, (value) => {
        expect(service.verify(value, service.sign(value))).toBe(true);
      }),
      FC_CONFIG,
    );
  });
});

describe.each(typedObjectArbitraries)(
  'SignatureService — %s',
  (_name, arbitrary) => {
    const service = makeService();

    it('is invariant to property order at every nesting level', () => {
      fc.assert(
        fc.property(arbitrary, fc.integer(), (value, seed) => {
          const shuffled = shuffleKeysDeep(value, seededRng(seed));
          const signature = service.sign(value);

          expect(service.sign(shuffled)).toBe(signature);
          expect(service.verify(shuffled, signature)).toBe(true);
        }),
        FC_CONFIG,
      );
    });

    it('invalidates the signature when the payload is mutated', () => {
      fc.assert(
        fc.property(
          arbitrary,
          fc.string({ minLength: 1 }),
          fc.string(),
          (payload, extraKey, extraValue) => {
            // The mutation must actually change the payload: skip a key that
            // is already present.
            fc.pre(!Object.prototype.hasOwnProperty.call(payload, extraKey));

            const signature = service.sign(payload);
            const mutated: JsonObject = { ...payload, [extraKey]: extraValue };

            expect(service.verify(mutated, signature)).toBe(false);
          },
        ),
        FC_CONFIG,
      );
    });
  },
);
