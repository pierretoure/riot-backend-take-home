import { canonicalize } from '../common/json/canonicalize';
import type { JsonValue } from '../common/json/json.types';
import type { Signer } from './ports/signer.port';
import { SignatureService } from './signature.service';

function makeFakeSigner(): jest.Mocked<Signer> {
  return {
    sign: jest.fn((payload: string) => `signed:${payload}`),
    verify: jest.fn(
      (payload: string, signature: string) => signature === `signed:${payload}`,
    ),
  };
}

describe('SignatureService', () => {
  it('signs the canonicalized form of the payload, not its raw shape', () => {
    const signer = makeFakeSigner();
    const service = new SignatureService(signer);
    const payload: JsonValue = { b: 2, a: 1 };

    const signature = service.sign(payload);

    // `signer.sign` is a `jest.fn()`, not a real prototype method: it never
    // reads `this`, so detaching it here is safe.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(signer.sign).toHaveBeenCalledWith(canonicalize(payload));
    expect(signature).toBe(`signed:${canonicalize(payload)}`);
  });

  it('produces the same signature regardless of property order', () => {
    const signer = makeFakeSigner();
    const service = new SignatureService(signer);

    const signatureA = service.sign({ message: 'Hello World', timestamp: 1 });
    const signatureB = service.sign({ timestamp: 1, message: 'Hello World' });

    expect(signatureA).toBe(signatureB);
  });

  it('verifies data against a signature using the canonicalized form', () => {
    const signer = makeFakeSigner();
    const service = new SignatureService(signer);
    const data: JsonValue = { a: 1 };
    const signature = service.sign(data);

    expect(service.verify(data, signature)).toBe(true);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- see above
    expect(signer.verify).toHaveBeenCalledWith(canonicalize(data), signature);
  });

  it('rejects verification when the underlying signer rejects it', () => {
    const signer = makeFakeSigner();
    const service = new SignatureService(signer);

    expect(service.verify({ a: 1 }, 'not-a-real-signature')).toBe(false);
  });
});
