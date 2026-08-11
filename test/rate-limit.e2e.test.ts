import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from '../src/testing/create-test-app';
import { AppModule } from '../src/app.module';

/** The four rate-limited endpoints, in the order the burst cycles through. */
const THROTTLED_ROUTES = ['/encrypt', '/decrypt', '/sign', '/verify'] as const;

/**
 * The rate limit is a property of the application, not of any one endpoint:
 * a client gets a single budget (30 requests / 10 s, see `AppModule`) that
 * every route draws from. Spending it across four endpoints must therefore
 * be rejected just as spending it on one is — which is exactly what the
 * throttler's stock per-handler keying would *not* do, hence
 * `ClientThrottlerGuard`.
 */
describe('Rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp([AppModule]);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Ten sequential rounds over the four endpoints.
   */
  async function burstAcrossEveryEndpoint(): Promise<number[]> {
    const statuses: number[] = [];

    for (let round = 0; round < 10; round += 1) {
      for (const route of THROTTLED_ROUTES) {
        const response = await request(app.getHttpServer())
          .post(route)
          .send({ message: 'Hello World' });
        statuses.push(response.status);
      }
    }

    return statuses;
  }

  it('returns 429 once a client exhausts the shared budget, whichever endpoints it spends it on', async () => {
    const statuses = await burstAcrossEveryEndpoint();

    // No single endpoint was hit more than 10 times, so a per-route quota of
    // 30 would have let all 40 requests through: a rejection can only come
    // from the budget being shared.
    expect(statuses).toContain(429);
  });

  it('rejects with a 429 body describing the throttling', async () => {
    const statuses = await burstAcrossEveryEndpoint();
    expect(statuses).toContain(429);

    const response = await request(app.getHttpServer())
      .post('/encrypt')
      .send({ a: 1 });

    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ statusCode: 429 });
  });

  it('never throttles GET /health, even once the shared budget is exhausted', async () => {
    const statuses = await burstAcrossEveryEndpoint();
    expect(statuses).toContain(429);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
