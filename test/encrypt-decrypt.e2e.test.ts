import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../src/testing/create-test-app';
import { AppModule } from '../src/app.module';

/**
 * End-to-end coherence requirement: `POST /encrypt` followed by
 * `POST /decrypt` must restitute the original payload, types included.
 * Every assertion here feeds the output of one HTTP call into the next — no
 * intermediate ciphertext is ever hardcoded, so a broken `/encrypt` cannot
 * be masked by a `/decrypt` that merely happens to agree with a value
 * copy-pasted into the test.
 */
describe('POST /encrypt -> POST /decrypt (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([AppModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  async function roundTrip(payload: Record<string, unknown>): Promise<{
    encryptStatus: number;
    decryptStatus: number;
    result: unknown;
  }> {
    const encryptResponse = await request(app.getHttpServer())
      .post('/encrypt')
      .send(payload);

    const decryptResponse = await request(app.getHttpServer())
      .post('/decrypt')
      .send(encryptResponse.body as Record<string, unknown>);

    return {
      encryptStatus: encryptResponse.status,
      decryptStatus: decryptResponse.status,
      result: decryptResponse.body,
    };
  }

  const cases: Array<[string, Record<string, unknown>]> = [
    [
      'subject.md literal example',
      {
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
      },
    ],
    [
      'mixed primitive types',
      {
        str: 'hello',
        num: -1.5,
        bool: true,
        nul: null,
        flag: false,
        zero: 0,
      },
    ],
    [
      'nested objects, several levels deep',
      {
        a: { b: { c: { d: 'deep', e: 42 } } },
      },
    ],
    [
      'arrays as depth-1 values',
      {
        list: [1, 'two', { three: 3 }, [4, 5]],
        empty_list: [],
      },
    ],
    [
      'null as a depth-1 value',
      {
        value: null,
      },
    ],
    [
      'unicode strings',
      {
        greeting: 'héllo wörld 日本語 🎉',
      },
    ],
    [
      'empty strings',
      {
        empty: '',
      },
    ],
  ];

  it.each(cases)(
    'round-trips %s, restoring the original payload with types intact',
    async (_description, payload) => {
      const { encryptStatus, decryptStatus, result } = await roundTrip(payload);

      expect(encryptStatus).toBe(200);
      expect(decryptStatus).toBe(200);
      expect(result).toStrictEqual(payload);
    },
  );

  it('leaves a property left in clear (birth_date) untouched by /decrypt, while other properties round-trip', async () => {
    const original = {
      name: 'John Doe',
      age: 30,
      contact: {
        email: 'john@example.com',
        phone: '123-456-7890',
      },
    };

    const encryptResponse = await request(app.getHttpServer())
      .post('/encrypt')
      .send(original);

    expect(encryptResponse.status).toBe(200);

    const decryptResponse = await request(app.getHttpServer())
      .post('/decrypt')
      .send({
        ...(encryptResponse.body as Record<string, unknown>),
        birth_date: '1998-11-19',
      });

    expect(decryptResponse.status).toBe(200);
    expect(decryptResponse.body).toStrictEqual({
      ...original,
      birth_date: '1998-11-19',
    });
  });
});
