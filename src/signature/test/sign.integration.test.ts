import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
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
});
