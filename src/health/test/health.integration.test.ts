import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../../testing/create-test-app';
import { burstStatuses } from '../../testing/rate-limit';
import { setupSwagger } from '../../common/setup-swagger';
import { AppModule } from '../../app.module';

const SIGNER_SECRET = 'health-integration-test-secret-SENTINEL-32chars';

describe('GET /health and Swagger documentation (app assembly)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.SIGNER_SECRET = SIGNER_SECRET;
    // `setupSwagger` (the exact function production uses, see `src/main.ts`)
    // must run before `app.init()`, hence `createTestApp`'s `beforeInit` hook.
    app = await createTestApp([AppModule], setupSwagger);
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds 200 { status: "ok" } on /health', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('serves an OpenAPI document on /docs-json containing every route', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.status).toBe(200);
    const paths = (response.body as { paths: Record<string, unknown> }).paths;
    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '/encrypt',
        '/decrypt',
        '/sign',
        '/verify',
        '/health',
      ]),
    );
  });

  it('never leaks the signer secret in /docs-json', async () => {
    const response = await request(app.getHttpServer()).get('/docs-json');

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(SIGNER_SECRET);
  });

  describe('rate limiting', () => {
    let throttledApp: NestExpressApplication;

    // A dedicated application, so exhausting the quota below leaves the
    // assertions above untouched.
    beforeAll(async () => {
      throttledApp = await createTestApp([AppModule]);
    });

    afterAll(async () => {
      await throttledApp.close();
    });

    it('never throttles GET /health, even after exhausting the limit elsewhere', async () => {
      const statuses = await burstStatuses(throttledApp, '/encrypt', { a: 1 });
      expect(statuses).toContain(429);

      const response = await request(throttledApp.getHttpServer()).get(
        '/health',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });
});
