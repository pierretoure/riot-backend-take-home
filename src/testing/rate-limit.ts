import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Comfortably above the app-wide throttler limit (20 requests / 10 s per IP,
 * see `AppModule`), so a burst of this size is guaranteed to cross it.
 */
export const RATE_LIMIT_BURST = 25;

/**
 * Fires `count` sequential POSTs at `path` and returns their status codes.
 *
 * Sequential rather than concurrent on purpose: the throttler counts hits as
 * they arrive, and serialising them makes "the tail of the burst is rejected"
 * a deterministic outcome instead of a race between in-flight requests.
 *
 * The application under test must be built from `AppModule` — the global
 * `ThrottlerGuard` is registered there, not on the feature modules.
 */
export async function burstStatuses(
  app: NestExpressApplication,
  path: string,
  body: string | object = {},
  count: number = RATE_LIMIT_BURST,
): Promise<number[]> {
  const statuses: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const response = await request(app.getHttpServer()).post(path).send(body);
    statuses.push(response.status);
  }

  return statuses;
}
