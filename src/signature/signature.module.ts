import {
  Module,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HmacSha256Signer } from './adapters/hmac-sha256.signer';
import { StrictJsonBodyMiddleware } from './middleware/strict-json-body.middleware';
import { SIGNER } from './ports/signer.port';
import { SignatureController } from './signature.controller';
import { SignatureService } from './signature.service';

/**
 * Wires the signature domain. `SIGNER` is the single provider binding to
 * change in order to swap the signing algorithm.
 *
 * `ConfigModule` is imported explicitly so this module is self-sufficient
 * in isolation (e.g. in integration tests that mount only `SignatureModule`
 * via `createTestApp`); in the full application it is already global
 * (`AppConfigModule`, `isGlobal: true`), so this import is a no-op there.
 */
@Module({
  imports: [ConfigModule],
  controllers: [SignatureController],
  providers: [
    { provide: SIGNER, useClass: HmacSha256Signer },
    SignatureService,
  ],
})
export class SignatureModule implements NestModule {
  /**
   * The raw-body RFC 8785 checks are bound here rather than globally: they
   * are a canonicalization concern, and only these two routes canonicalize.
   * See `StrictJsonBodyMiddleware`.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(StrictJsonBodyMiddleware).forRoutes('sign', 'verify');
  }
}
