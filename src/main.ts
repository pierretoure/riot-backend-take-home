import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  NEST_APP_OPTIONS,
  applyGlobalConfig,
} from './common/apply-global-config';
import { setupSwagger } from './common/setup-swagger';
import type { Env } from './config/env.schema';

/**
 * Bootstraps the application. `helmet` is applied only here (not in
 * `applyGlobalConfig`) because it sets HTTP response headers that are a
 * pure hardening concern with no bearing on the request-validation/
 * error-format behaviour that integration and e2e tests assert on — unlike
 * `applyGlobalConfig`'s pipes/filter/interceptor, divergence here would not
 * make those tests lie about production behaviour.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    NEST_APP_OPTIONS,
  );

  app.use(helmet());
  applyGlobalConfig(app);
  setupSwagger(app);

  const configService = app.get(ConfigService<Env, true>);
  const port = configService.get('PORT', { infer: true });

  await app.listen(port);
}
void bootstrap();
