import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { SignatureModule } from '../signature.module';

const SIGNER_SECRET = 'a'.repeat(32);

describe('/sign and /verify error handling', () => {
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

  function expectErrorBody(body: unknown, statusCode: number): void {
    // Jest's asymmetric matchers (`expect.any`/`expect.anything`) are
    // untyped by design; disabling the unsafe-assignment check here is
    // limited to this single matcher-building call.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    expect(body).toMatchObject({
      statusCode,
      error: expect.any(String),
      message: expect.anything(),
      requestId: expect.any(String),
    });
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  }

  it('rejects a request with no body at all on /sign with 400', async () => {
    // No `Content-Type` and no payload: Express's body parser never runs,
    // so the controller sees `undefined`, which is not a JSON object.
    const response = await request(app.getHttpServer()).post('/sign');

    expect(response.status).toBe(400);
    expectErrorBody(response.body, 400);
  });

  it('rejects malformed JSON on /sign with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .set('Content-Type', 'application/json')
      .send('{not valid json');

    expect(response.status).toBe(400);
    expectErrorBody(response.body, 400);
  });

  it('rejects a non-JSON Content-Type on /sign with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .set('Content-Type', 'text/plain')
      .send('hello');

    expect(response.status).toBe(400);
  });

  it('rejects an array root on /sign with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .send([1, 2, 3]);

    expect(response.status).toBe(400);
    expectErrorBody(response.body, 400);
  });

  it('rejects /verify without a signature property with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ data: { a: 1 } });

    expect(response.status).toBe(400);
    expectErrorBody(response.body, 400);
  });

  it('rejects /verify without a data property with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature: 'a'.repeat(64) });

    expect(response.status).toBe(400);
    expectErrorBody(response.body, 400);
  });

  it('rejects /verify with an empty signature string with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature: '', data: { a: 1 } });

    expect(response.status).toBe(400);
  });

  it('rejects /verify with a null data value with 400 (explicit but insufficient)', async () => {
    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature: 'a'.repeat(64), data: null });

    // `data: null` is a well-formed JSON value; the request only fails
    // because the (correctly formed) signature does not match it.
    expect(response.status).toBe(400);
  });

  it('rejects an oversized body with 413', async () => {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .send({ big: 'x'.repeat(200_000) });

    expect(response.status).toBe(413);
  });

  describe('RFC 8785 input constraints', () => {
    it.each([
      ['/sign', '{"a":1,"a":2}'],
      ['/verify', '{"signature":"00","data":{},"data":{}}'],
      ['/sign', '{"outer":{"a":1,"a":2}}'],
    ])(
      'rejects a duplicate property name on %s with 400',
      async (route, body) => {
        // RFC 8785 §3.1 forbids duplicate names. Node's `JSON.parse` keeps
        // the last one, so `{"a":1,"a":2}` and `{"a":2}` would otherwise
        // receive the same signature.
        const response = await request(app.getHttpServer())
          .post(route)
          .set('Content-Type', 'application/json')
          .send(body);

        expect(response.status).toBe(400);
        expectErrorBody(response.body, 400);
      },
    );

    it('rejects a body containing invalid UTF-8 with 400', async () => {
      const invalid = Buffer.concat([
        Buffer.from('{"a":"', 'utf8'),
        Buffer.from([0xff]),
        Buffer.from('"}', 'utf8'),
      ]);

      const response = await request(app.getHttpServer())
        .post('/sign')
        .set('Content-Type', 'application/json')
        // Superagent JSON-serializes a Buffer into `{"type":"Buffer",...}`
        // by default. The identity serializer sends the bytes untouched,
        // which is the whole point of this case. Its Node implementation
        // accepts a Buffer, but the bundled type declaration only admits a
        // string — hence the cast.
        .serialize((data: Buffer) => data as unknown as string)
        .send(invalid);

      expect(response.status).toBe(400);
      expectErrorBody(response.body, 400);
    });

    it('rejects a non-finite number with 400 rather than 500', async () => {
      // `1e400` overflows to `Infinity` during parsing; canonicalizing it
      // must fail loudly instead of signing the string "null".
      const response = await request(app.getHttpServer())
        .post('/sign')
        .set('Content-Type', 'application/json')
        .send('{"a":1e400}');

      expect(response.status).toBe(400);
      expectErrorBody(response.body, 400);
    });

    it('rejects a lone surrogate with 400 rather than 500', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign')
        .set('Content-Type', 'application/json')
        .send('{"a":"\\ud800"}');

      expect(response.status).toBe(400);
      expectErrorBody(response.body, 400);
    });

    it('still accepts a well-formed surrogate pair', async () => {
      const response = await request(app.getHttpServer())
        .post('/sign')
        .set('Content-Type', 'application/json')
        .send('{"a":"\\ud83d\\ude00"}');

      expect(response.status).toBe(200);
    });
  });

  it('never returns 500 for pathological input', async () => {
    const pathologicalBodies: string[] = [
      JSON.stringify(null),
      JSON.stringify(42),
      JSON.stringify(true),
      JSON.stringify('a string body'),
      JSON.stringify({ signature: 123, data: {} }),
      JSON.stringify({ signature: {}, data: {} }),
      JSON.stringify({ signature: 'zzzzzzzz', data: {} }),
    ];

    for (const body of pathologicalBodies) {
      const response = await request(app.getHttpServer())
        .post('/verify')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBeLessThan(500);
    }

    for (const body of pathologicalBodies) {
      const response = await request(app.getHttpServer())
        .post('/sign')
        .set('Content-Type', 'application/json')
        .send(body);

      expect(response.status).toBeLessThan(500);
    }
  });
});
