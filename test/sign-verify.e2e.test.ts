import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../src/testing/create-test-app';
import { AppModule } from '../src/app.module';
import { shuffleKeysDeep } from '../src/testing/shuffle-keys-deep';
import type { JsonObject } from '../src/common/json/json.types';

/**
 * End-to-end coherence requirement: `POST /sign` followed by
 * `POST /verify` with the signature it produced must return `204`,
 * independently of property order at every nesting level, and must reject a
 * payload altered after signing. The signature used by every `/verify` call
 * below always comes from a prior `/sign` response — never hardcoded.
 */
describe('POST /sign -> POST /verify (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([AppModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  async function sign(data: JsonObject): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/sign')
      .send(data);
    const body = response.body as { signature: string };
    return body.signature;
  }

  /** Deterministic RNG so a failing shuffle is reproducible, mirroring the
   * seeding used by `signature.service.property.test.ts`. */
  function makeRng(seed: number): () => number {
    let state = seed >>> 0 || 1;
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
  }

  it('verifies successfully for the subject.md literal example', async () => {
    const data = { message: 'Hello World', timestamp: 1616161616 };

    const signature = await sign(data);

    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature, data });

    expect(response.status).toBe(204);
    expect(response.body).toEqual({});
  });

  it('remains valid when properties are reordered at every nesting level', async () => {
    const data: JsonObject = {
      timestamp: 1616161616,
      message: 'Hello World',
      contact: {
        email: 'john@example.com',
        phone: '123-456-7890',
        address: {
          city: 'Paris',
          country: 'France',
          zip: '75000',
        },
      },
      tags: ['a', 'b', { nested: true, other: false }],
    };

    const signature = await sign(data);

    const reordered = shuffleKeysDeep(data, makeRng(42));

    // Both structures must remain deeply equal as data...
    expect(reordered).toStrictEqual(data);
    // ...but their serialized key order must actually differ, otherwise the
    // test would still pass with a no-op shuffle and would prove nothing
    // about order invariance. `toStrictEqual` alone is order-insensitive.
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(data));

    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature, data: reordered });

    expect(response.status).toBe(204);
  });

  it('rejects data altered after signing (subject.md "Goodbye World" example)', async () => {
    const data = { message: 'Hello World', timestamp: 1616161616 };

    const signature = await sign(data);

    const tampered = { timestamp: 1616161616, message: 'Goodbye World' };

    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature, data: tampered });

    expect(response.status).toBe(400);
  });

  it('rejects a signature altered after signing, for otherwise valid data', async () => {
    const data = { message: 'Hello World', timestamp: 1616161616 };

    const signature = await sign(data);
    const tamperedSignature =
      signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');

    const response = await request(app.getHttpServer())
      .post('/verify')
      .send({ signature: tamperedSignature, data });

    expect(response.status).toBe(400);
  });
});
