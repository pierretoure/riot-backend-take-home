import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

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
