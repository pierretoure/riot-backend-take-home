import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { CryptoModule } from '../crypto.module';

describe('POST /encrypt', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([CryptoModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('encrypts every depth-1 property, subject.md literal example', async () => {
    const response = await request(app.getHttpServer())
      .post('/encrypt')
      .send({
        name: 'John Doe',
        age: 30,
        contact: {
          email: 'john@example.com',
          phone: '123-456-7890',
        },
      });

    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['name', 'age', 'contact']);
    for (const value of Object.values(body)) {
      expect(typeof value).toBe('string');
    }
  });

  it('base64(JSON.stringify(value)) for a number', async () => {
    const response = await request(app.getHttpServer())
      .post('/encrypt')
      .send({ age: 30 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ age: 'MzA=' });
  });

  it('base64(JSON.stringify(value)) for a string', async () => {
    const response = await request(app.getHttpServer())
      .post('/encrypt')
      .send({ name: 'John Doe' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ name: 'IkpvaG4gRG9lIg==' });
  });

  it('base64(JSON.stringify(value)) for null', async () => {
    const response = await request(app.getHttpServer())
      .post('/encrypt')
      .send({ maybe: null });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ maybe: 'bnVsbA==' });
  });

  it('accepts an empty object', async () => {
    const response = await request(app.getHttpServer())
      .post('/encrypt')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });
});
