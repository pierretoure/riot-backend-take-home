import fc from 'fast-check';
import { Base64Cipher } from './adapters/base64.cipher';
import { CryptoService } from './crypto.service';
import { FC_CONFIG, typedObjectArbitraries } from '../testing/json-arbitraries';

describe.each(typedObjectArbitraries)(
  'CryptoService — %s',
  (_name, arbitrary) => {
    const service = new CryptoService(new Base64Cipher());

    it('decryptPayload(encryptPayload(x)) === x, types included', () => {
      fc.assert(
        fc.property(arbitrary, (payload) => {
          const encrypted = service.encryptPayload(payload);
          const decrypted = service.decryptPayload(encrypted);

          expect(decrypted).toEqual(payload);
        }),
        FC_CONFIG,
      );
    });

    it('encryptPayload turns every property into a string, key set preserved', () => {
      fc.assert(
        fc.property(arbitrary, (payload) => {
          const encrypted = service.encryptPayload(payload);

          expect(Object.keys(encrypted).sort()).toEqual(
            Object.keys(payload).sort(),
          );
          for (const key of Object.keys(encrypted)) {
            expect(typeof encrypted[key]).toBe('string');
          }
        }),
        FC_CONFIG,
      );
    });
  },
);
