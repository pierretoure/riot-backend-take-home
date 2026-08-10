import { Test } from '@nestjs/testing';
import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { applyGlobalConfig } from '../common/apply-global-config';

/**
 * Builds an initialized Nest application for integration/e2e tests, wired
 * with exactly the same global configuration as production (see
 * `applyGlobalConfig` in `src/common/apply-global-config.ts`).
 *
 * Excluded from the production build (`tsconfig.build.json`); it exists
 * solely to be shared between `src/<domain>/test/*.integration.test.ts` and
 * `test/*.e2e.test.ts`, per cahier des charges §3.4.
 *
 * @param imports Modules to compile the test application from.
 * @param beforeInit Optional hook run after `applyGlobalConfig` but before
 * `app.init()`, for setup that (like Swagger's `SwaggerModule.setup`) must
 * run before the underlying HTTP adapter is initialized.
 */
export async function createTestApp(
  imports: NonNullable<ModuleMetadata['imports']> = [],
  beforeInit?: (app: NestExpressApplication) => void,
): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  applyGlobalConfig(app);
  beforeInit?.(app);
  await app.init();

  return app;
}
