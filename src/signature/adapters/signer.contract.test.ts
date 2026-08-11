import { ConfigService } from '@nestjs/config';
import { HmacSha256Signer } from './hmac-sha256.signer';
import type { Signer } from '../ports/signer.port';

/**
 * Contract test for the `Signer` port: every adapter must satisfy the same
 * behavioural contract regardless of its concrete algorithm. Run via
 * `describe.each` so a second adapter only has to be added to the list
 * below to be held to the same rules.
 */
const implementations: Array<[string, () => Signer]> = [
  [
    'HmacSha256Signer',
    () =>
      new HmacSha256Signer(
        new ConfigService({ SIGNER_SECRET: 'a'.repeat(32) }),
      ),
  ],
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
