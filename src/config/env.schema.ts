import type { LogLevel } from '@nestjs/common';
import { z } from 'zod';

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const satisfies readonly LogLevel[];

/**
 * `HMAC_SECRET` has no default: an application without a valid secret must
 * fail to start rather than fall back to an insecure default.
 */
export const envSchema = z.object({
  HMAC_SECRET: z
    .string({
      error: () => 'HMAC_SECRET is required',
    })
    .min(32, 'HMAC_SECRET must be at least 32 characters long'),

  // `process.env` values are always strings; coerce to number before
  // range-checking so that non-numeric input (e.g. "abc") is rejected
  // rather than silently coerced to NaN and accepted.
  PORT: z.coerce
    .number({
      error: () => 'PORT must be a valid integer between 1 and 65535',
    })
    .int('PORT must be a valid integer between 1 and 65535')
    .min(1, 'PORT must be a valid integer between 1 and 65535')
    .max(65535, 'PORT must be a valid integer between 1 and 65535')
    .default(3000),

  NODE_ENV: z
    .enum(['development', 'test', 'production'], {
      error: () => 'NODE_ENV must be one of: development, test, production',
    })
    .default('development'),

  LOG_LEVEL: z
    .enum(LOG_LEVELS, {
      error: () => `LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}`,
    })
    .default('log'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates raw process environment variables against `envSchema`.
 *
 * Intended for use as the `validate` option of `ConfigModule.forRoot()` so
 * that the application refuses to start on invalid configuration
 * (fail-fast), instead of failing later on an incoming request.
 *
 * The resulting error message never includes the raw value of any
 * variable, so secrets (in particular `HMAC_SECRET`) cannot leak into logs
 * or crash output.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
