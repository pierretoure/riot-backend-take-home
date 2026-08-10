import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigModule } from './config/config.module';
import { CryptoModule } from './crypto/crypto.module';
import { HealthModule } from './health/health.module';
import { SignatureModule } from './signature/signature.module';

/**
 * Root module (cahier des charges §3.4). `ThrottlerGuard` is registered
 * globally via `APP_GUARD` so every route is rate-limited by default;
 * `HealthController` opts out individually with `@SkipThrottle()` (§8).
 *
 * Rate limiting is deliberately generous rather than tuned for production
 * traffic: 20 requests per 10 seconds per client IP, which is enough to
 * exercise the four endpoints under normal/manual testing while still
 * demonstrating a working `429` under a burst (see the throttler
 * integration test).
 */
@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 10_000, limit: 20 }],
    }),
    CryptoModule,
    SignatureModule,
    HealthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
