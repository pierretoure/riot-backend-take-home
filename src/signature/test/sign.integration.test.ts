import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { burstStatuses } from '../../testing/rate-limit';
import { AppModule } from '../../app.module';
import { SignatureModule } from '../signature.module';

const SIGNER_SECRET = 'a'.repeat(32);

/** Narrows a supertest JSON response body into `{ signature: string }`. */
function signatureOf(body: unknown): string {
  const candidate = body as { signature?: unknown };
  if (typeof candidate.signature !== 'string') {
    throw new Error('Expected response body to contain a string signature');
  }
  return candidate.signature;
}

describe('POST /sign (integration)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.SIGNER_SECRET = SIGNER_SECRET;
    app = await createTestApp([
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SignatureModule,
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns exclusively a signature property', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .send({ message: 'Hello World', timestamp: 1616161616 });

    expect(response.status).toBe(200);
    expect(Object.keys(response.body as object)).toEqual(['signature']);
    expect(signatureOf(response.body)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same signature regardless of property order (subject.md example)', async () => {
    const a = await request(app.getHttpServer())
      .post('/sign')
      .send({ message: 'Hello World', timestamp: 1616161616 });
    const b = await request(app.getHttpServer())
      .post('/sign')
      .send({ timestamp: 1616161616, message: 'Hello World' });

    expect(signatureOf(a.body)).toBe(signatureOf(b.body));
  });

  it('produces different signatures for the NFC and NFD spellings of a character', async () => {
    // Same perceived text ("cafe" + acute accent), two Unicode encodings:
    // precomposed U+00E9 versus decomposed "e" + U+0301. `canonicalize`
    // deliberately skips the RFC 8785 NFC normalization step, so the two
    // spellings stay distinct payloads down to the signature.
    const composed = 'caf\u00e9';
    const decomposed = 'cafe\u0301';
    expect(composed).not.toBe(decomposed);

    const nfc = await request(app.getHttpServer())
      .post('/sign')
      .send({ message: composed });
    const nfd = await request(app.getHttpServer())
      .post('/sign')
      .send({ message: decomposed });

    expect(nfc.status).toBe(200);
    expect(nfd.status).toBe(200);
    expect(signatureOf(nfc.body)).not.toBe(signatureOf(nfd.body));
  });

  it('produces the same signature whether a character is JSON-escaped or literal', async () => {
    // A \u00e9 escape and a literal U+00E9 parse to the very same string,
    // so this purely transport-level difference must not reach the signature.
    const escaped = await request(app.getHttpServer())
      .post('/sign')
      .set('Content-Type', 'application/json')
      .send('{"message":"caf\\u00e9"}');
    const literal = await request(app.getHttpServer())
      .post('/sign')
      .set('Content-Type', 'application/json')
      .send('{"message":"caf\u00e9"}');

    expect(escaped.status).toBe(200);
    expect(literal.status).toBe(200);
    expect(signatureOf(escaped.body)).toBe(signatureOf(literal.body));
  });

  it('rejects a non-object root (array) with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .send([1, 2, 3]);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });

  it('rejects a non-object root (scalar) with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .set('Content-Type', 'application/json')
      .send('42');

    expect(response.status).toBe(400);
  });

  describe('rate limiting', () => {
    let throttledApp: NestExpressApplication;

    // A dedicated application: the guard is global to `AppModule` rather than
    // to `SignatureModule`, and the burst below must not exhaust the quota of
    // the functional cases above.
    beforeAll(async () => {
      throttledApp = await createTestApp([AppModule]);
    });

    afterAll(async () => {
      await throttledApp.close();
    });

    it('returns 429 once the configured request threshold is exceeded', async () => {
      const statuses = await burstStatuses(throttledApp, '/sign', {
        message: 'Hello World',
      });

      expect(statuses).toContain(429);
    });
  });
});
