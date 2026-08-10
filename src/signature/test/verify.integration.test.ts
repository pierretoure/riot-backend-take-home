import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { SignatureModule } from '../signature.module';

const HMAC_SECRET = 'a'.repeat(32);

describe('POST /verify (integration)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.HMAC_SECRET = HMAC_SECRET;
    app = await createTestApp([
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SignatureModule,
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  async function sign(data: object): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .send(data);
    const body = response.body as { signature: string };
    return body.signature;
  }

  it('returns 204 with no body for a valid signature (subject.md example)', async () => {
    // Data comes from the sign() call — no hardcoded intermediate value,
    // consistent with "sign then verify" being the property under test.
    const data = { message: 'Hello World', timestamp: 1616161616 };
    const signature = await sign(data);

    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature, data });

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
    expect(response.text).toBe('');
  });

  it('returns 204 when the data properties are reordered (subject.md example)', async () => {
    const data = { message: 'Hello World', timestamp: 1616161616 };
    const signature = await sign(data);

    const reordered = { timestamp: 1616161616, message: 'Hello World' };
    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature, data: reordered });

    expect(response.status).toBe(204);
  });

  it('returns 400 for a tampered payload (subject.md "Goodbye World" example)', async () => {
    const data = { message: 'Hello World', timestamp: 1616161616 };
    const signature = await sign(data);

    const tampered = { timestamp: 1616161616, message: 'Goodbye World' };
    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature, data: tampered });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });
  });

  it('returns 400 for a tampered signature', async () => {
    const data = { message: 'Hello World', timestamp: 1616161616 };
    const signature = await sign(data);
    const tampered =
      signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');

    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature: tampered, data });

    expect(response.status).toBe(400);
  });
});
