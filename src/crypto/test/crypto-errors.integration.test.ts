import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { CryptoModule } from '../crypto.module';
import { MAX_VALUE_DEPTH } from '../crypto.service';

describe('crypto errors (/encrypt, /decrypt)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([CryptoModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  const routes = ['/encrypt', '/decrypt'];

  describe.each(routes)('%s', (route) => {
    it('rejects a malformed JSON body with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Content-Type', 'application/json')
        .send('{not valid json');

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });
      const body = response.body as { requestId: unknown };
      expect(body.requestId).toEqual(expect.any(String));
    });

    it('rejects a non-JSON Content-Type with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Content-Type', 'text/plain')
        .send('hello');

      expect(response.status).toBe(400);
    });

    it('rejects an array root with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(route)
        .send([1, 2, 3]);

      expect(response.status).toBe(400);
    });

    it('rejects a scalar (string) root with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Content-Type', 'application/json')
        .send('"just a string"');

      expect(response.status).toBe(400);
    });

    it('rejects a scalar (number) root with 400', async () => {
      const response = await request(app.getHttpServer())
        .post(route)
        .set('Content-Type', 'application/json')
        .send('42');

      expect(response.status).toBe(400);
    });

    it('rejects a body exceeding the 100kb size limit with 413', async () => {
      const response = await request(app.getHttpServer())
        .post(route)
        .send({ big: 'x'.repeat(200_000) });

      expect(response.status).toBe(413);
    });

    it('never returns 500, even for a pathologically deep payload', async () => {
      let deep: unknown = 0;
      for (let i = 0; i < MAX_VALUE_DEPTH + 10; i += 1) {
        deep = { a: deep };
      }

      const response = await request(app.getHttpServer())
        .post(route)
        .send({ deep });

      expect(response.status).not.toBe(500);
      expect(response.status).toBe(400);
    });

    it('never returns 500 for a payload with many top-level properties', async () => {
      const payload: Record<string, number> = {};
      for (let i = 0; i < 2000; i += 1) {
        payload[`k${i}`] = i;
      }

      const response = await request(app.getHttpServer())
        .post(route)
        .send(payload);

      expect(response.status).not.toBe(500);
      expect(response.status).toBe(400);
    });
  });

  describe('RFC 8785 input constraints', () => {
    it.each([
      ['/encrypt', '{"a":1,"a":2}'],
      ['/decrypt', '{"a":"MzA=","a":"MzE="}'],
      ['/encrypt', '{"outer":{"a":1,"a":2}}'],
    ])(
      'rejects a duplicate property name on %s with 400',
      async (route, body) => {
        const response = await request(app.getHttpServer())
          .post(route)
          .set('Content-Type', 'application/json')
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          statusCode: 400,
          error: 'Bad Request',
        });
      },
    );

    it.each(['/encrypt', '/decrypt'])(
      'rejects a body containing invalid UTF-8 on %s with 400',
      async (route) => {
        const invalid = Buffer.concat([
          Buffer.from('{"a":"', 'utf8'),
          Buffer.from([0xff]),
          Buffer.from('"}', 'utf8'),
        ]);

        const response = await request(app.getHttpServer())
          .post(route)
          .set('Content-Type', 'application/json')
          .serialize((data: Buffer) => data as unknown as string)
          .send(invalid);

        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          statusCode: 400,
          error: 'Bad Request',
        });
      },
    );
  });
});
