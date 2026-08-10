/**
 * Jest `setupFiles` entry: runs before any test module is imported.
 *
 * `AppModule` evaluates `ConfigModule.forRoot()` at import time, so the env
 * schema is validated while the module graph is being loaded — before any
 * `beforeAll` hook could set a variable. Without this file the suite only
 * passes on machines that happen to have a `.env` lying around, which is a
 * silent dependency on developer-local state.
 *
 * Values already present in the real environment win, so CI (and anyone
 * exporting their own) stays in control. `dotenv` likewise never overrides
 * an existing variable, so a local `.env` cannot break these defaults.
 */
process.env.HMAC_SECRET ??= 'jest-default-hmac-secret-32-chars-min';
process.env.LOG_LEVEL ??= 'error';
