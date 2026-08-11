import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientThrottlerGuard } from './common/guards/client-throttler.guard';
import { AppConfigModule } from './config/config.module';
import { CryptoModule } from './crypto/crypto.module';
import { HealthModule } from './health/health.module';
import { SignatureModule } from './signature/signature.module';

/**
 * Root module. `ClientThrottlerGuard` is registered globally via `APP_GUARD`
 * so every route is rate-limited by default; `HealthController` opts out
 * individually with `@SkipThrottle()`.
 *
 * The budget is per client IP and *shared by all endpoints*: 30 requests per
 * 10 seconds, whether they land on one route or are spread across the four
 * (see `ClientThrottlerGuard` for how, and `test/rate-limit.e2e.test.ts` for
 * the contract). The figure is deliberately generous rather than tuned for
 * production traffic — enough to exercise the API by hand, and to leave the
 * e2e suites room under the shared budget, while still demonstrating a
 * working `429` under a burst.
 */
@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 10_000, limit: 30 }],
    }),
    CryptoModule,
    SignatureModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ClientThrottlerGuard }],
})
export class AppModule {}
