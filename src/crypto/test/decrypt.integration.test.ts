import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { burstStatuses } from '../../testing/rate-limit';
import { AppModule } from '../../app.module';
import { CryptoModule } from '../crypto.module';

describe('POST /decrypt', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([CryptoModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('decrypts the output of the /encrypt example back to the original payload', async () => {
    const encryptResponse = await request(app.getHttpServer())
      .post('/encrypt')
      .send({
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
      });

    const decryptResponse = await request(app.getHttpServer())
      .post('/decrypt')
      .send(encryptResponse.body);

    expect(decryptResponse.status).toBe(200);
    expect(decryptResponse.body).toEqual({
      name: 'John Doe',
      age: 30,
      contact: {
        email: 'john@example.com',
        phone: '123-456-7890',
      },
    });
  });

  it('leaves unencrypted properties (e.g. birth_date) strictly unchanged', async () => {
    const encryptResponse = await request(app.getHttpServer())
      .post('/encrypt')
      .send({
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
      });

    const decryptResponse = await request(app.getHttpServer())
      .post('/decrypt')
      .send({ ...encryptResponse.body, birth_date: '1998-11-19' });

    expect(decryptResponse.status).toBe(200);
    expect(decryptResponse.body).toEqual({
      name: 'John Doe',
      age: 30,
      contact: {
        email: 'john@example.com',
        phone: '123-456-7890',
      },
      birth_date: '1998-11-19', // This remains unchanged
    });
  });

  it('decodes "MzA=" back to the number 30', async () => {
    const response = await request(app.getHttpServer())
      .post('/decrypt')
      .send({ age: 'MzA=' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ age: 30 });
  });

  it('accepts an empty object', async () => {
    const response = await request(app.getHttpServer())
      .post('/decrypt')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });

  describe('rate limiting', () => {
    let throttledApp: NestExpressApplication;

    // A dedicated application: the guard is global to `AppModule` rather than
    // to `CryptoModule`, and the burst below must not exhaust the quota of
    // the functional cases above.
    beforeAll(async () => {
      throttledApp = await createTestApp([AppModule]);
    });

    afterAll(async () => {
      await throttledApp.close();
    });

    it('returns 429 once the configured request threshold is exceeded', async () => {
      const statuses = await burstStatuses(throttledApp, '/decrypt', { a: 1 });

      expect(statuses).toContain(429);
    });
  });
});
