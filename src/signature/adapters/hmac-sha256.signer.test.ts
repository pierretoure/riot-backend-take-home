import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { HmacSha256Signer } from './hmac-sha256.signer';

const SECRET = 'a'.repeat(32);

function makeSigner(secret: string = SECRET): HmacSha256Signer {
  return new HmacSha256Signer(new ConfigService({ HMAC_SECRET: secret }));
}

/**
 * A `ConfigService` that reports no `HMAC_SECRET`, regardless of the actual
 * test-runner process environment (which, in CI and in this repo's own test
 * scripts, does set `HMAC_SECRET` — see `pnpm test:unit`). A real
 * `ConfigService` instance falls back to `process.env` when a key is absent
 * from its internal config, so it cannot reliably simulate "unconfigured"
 * here; a minimal stand-in exposing only the `get` method actually used by
 * `HmacSha256Signer` is used instead.
 */
function makeSignerWithoutSecret(): HmacSha256Signer {
  const configServiceStub = {
    get: () => undefined,
  } as unknown as ConfigService;
  return new HmacSha256Signer(configServiceStub);
}

describe('HmacSha256Signer', () => {
  it('produces a lowercase hexadecimal SHA-256 HMAC digest', () => {
    const signer = makeSigner();
    const signature = signer.sign('payload');

    expect(signature).toBe(
      createHmac('sha256', SECRET).update('payload').digest('hex'),
    );
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same payload and secret', () => {
    const signer = makeSigner();

    expect(signer.sign('payload')).toBe(signer.sign('payload'));
  });

  it('produces a different signature for a different secret', () => {
    const signerA = makeSigner('a'.repeat(32));
    const signerB = makeSigner('b'.repeat(32));

    expect(signerA.sign('payload')).not.toBe(signerB.sign('payload'));
  });

  it('verifies a signature produced by sign()', () => {
    const signer = makeSigner();

    expect(signer.verify('payload', signer.sign('payload'))).toBe(true);
  });

  it('rejects a signature computed for a different payload', () => {
    const signer = makeSigner();
    const signature = signer.sign('payload');

    expect(signer.verify('other-payload', signature)).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const signer = makeSigner();
    const signature = signer.sign('payload');
    const tampered =
      signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');

    expect(signer.verify('payload', tampered)).toBe(false);
  });

  it('returns false, without throwing, for a signature of a different length', () => {
    const signer = makeSigner();

    expect(() => signer.verify('payload', 'ab')).not.toThrow();
    expect(signer.verify('payload', 'ab')).toBe(false);
    expect(() =>
      signer.verify('payload', signer.sign('payload') + 'ff'),
    ).not.toThrow();
    expect(signer.verify('payload', signer.sign('payload') + 'ff')).toBe(false);
  });

  it('returns false, without throwing, for a non-hexadecimal signature', () => {
    const signer = makeSigner();

    expect(() => signer.verify('payload', 'zzzz')).not.toThrow();
    expect(signer.verify('payload', 'zzzz')).toBe(false);
    expect(() => signer.verify('payload', '@@@@')).not.toThrow();
    expect(signer.verify('payload', '@@@@')).toBe(false);
    expect(signer.verify('payload', '')).toBe(false);
  });

  it('throws without ever including the secret value when misconfigured', () => {
    const signer = makeSignerWithoutSecret();

    expect(() => signer.sign('payload')).toThrow(
      'HMAC_SECRET is not configured',
    );
  });
});
