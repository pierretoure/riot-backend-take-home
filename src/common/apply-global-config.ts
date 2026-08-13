import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

/**
 * Application-creation options shared between production (`src/main.ts`)
 * and tests (`src/testing/create-test-app.ts`), for the same reason as
 * `applyGlobalConfig` below: they must not diverge.
 *
 * `rawBody` keeps the undecoded request body available on `req.rawBody`.
 * `StrictJsonBodyMiddleware` needs it to enforce the two RFC 8785 input
 * constraints that `JSON.parse` erases — invalid UTF-8 (silently replaced
 * with U+FFFD) and duplicate property names (silently collapsed to the last
 * occurrence).
 */
export const NEST_APP_OPTIONS = { rawBody: true } as const;

/**
 * Applies the global HTTP configuration shared between production
 * (`src/main.ts`) and tests (`src/testing/create-test-app.ts`): request
 * validation, the global exception filter, the logging interceptor, and the
 * request body size limit.
 *
 * Centralizing this in a single function guarantees that integration and
 * e2e tests observe the exact same error/response behaviour as production —
 * if `main.ts` diverged from this function, tests would no longer prove
 * anything about the deployed application.
 */
export function applyGlobalConfig(app: NestExpressApplication): void {
  // Replace the default JSON body parser to enforce the 100kb request body
  // limit; oversized bodies are rejected by Express before reaching any
  // controller, resulting in a 413.
  app.useBodyParser('json', { limit: '100kb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
}
