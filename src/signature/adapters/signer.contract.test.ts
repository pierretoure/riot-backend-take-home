import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { HmacSha256Signer } from './hmac-sha256.signer';
import type { Signer } from '../ports/signer.port';

/**
 * Minimal alternative `Signer` implementation. It exists solely to prove
 * that the `Signer` port abstraction is real — that the domain can be
 * exercised against more than one algorithm — and is never wired into the
 * application.
 */
class UppercaseHexSigner implements Signer {
  sign(payload: string): string {
    return Buffer.from(payload, 'utf8').toString('hex').toUpperCase();
  }

  verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const candidate = Buffer.from(signature);

    if (expected.length !== candidate.length) {
      return false;
    }

    return timingSafeEqual(expected, candidate);
  }
}

const implementations: Array<[string, () => Signer]> = [
  [
    'HmacSha256Signer',
    () =>
      new HmacSha256Signer(
        new ConfigService({ SIGNER_SECRET: 'a'.repeat(32) }),
      ),
  ],
  ['UppercaseHexSigner', () => new UppercaseHexSigner()],
];

describe.each(implementations)('Signer contract: %s', (_name, createSigner) => {
  let signer: Signer;

  beforeEach(() => {
    signer = createSigner();
  });

  it('verify(payload, sign(payload)) is true', () => {
    expect(signer.verify('hello', signer.sign('hello'))).toBe(true);
  });

  it('returns false when the payload changes', () => {
    const signature = signer.sign('hello');

    expect(signer.verify('goodbye', signature)).toBe(false);
  });

  it('returns false when the signature changes', () => {
    const otherSignature = signer.sign('goodbye');

    expect(signer.verify('hello', otherSignature)).toBe(false);
  });

  it('sign is deterministic for the same payload', () => {
    expect(signer.sign('hello')).toBe(signer.sign('hello'));
  });
});
