import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { AppModule } from '../../app.module';

// Distinct from other integration suites' SIGNER_SECRET to avoid any
// cross-test coupling through `process.env`.
const SIGNER_SECRET = 'rate-limit-integration-test-secret-32-chars-min';

describe('Rate limiting', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.SIGNER_SECRET = SIGNER_SECRET;
    app = await createTestApp([AppModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 once the configured request threshold is exceeded', async () => {
    const responses = [];
    for (let i = 0; i < 25; i += 1) {
      responses.push(
        await request(app.getHttpServer()).post('/encrypt').send({ a: 1 }),
      );
    }

    const statuses = responses.map((response) => response.status);
    expect(statuses).toContain(429);
  });

  it('never throttles GET /health, even after exhausting the limit elsewhere', async () => {
    for (let i = 0; i < 25; i += 1) {
      await request(app.getHttpServer()).post('/decrypt').send({ a: 1 });
    }

    const response = await request(app.getHttpServer()).get('/health');
    expect(response.status).toBe(200);
  });
});
