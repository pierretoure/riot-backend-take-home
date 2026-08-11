import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../env.schema';

/**
 * Integration-level coverage of the fail-fast requirement: the application
 * must refuse to start without a valid `HMAC_SECRET`. `env.schema.test.ts`
 * already unit-tests `validateEnv` in isolation; this test instead exercises
 * the real Nest wiring path used by `AppConfigModule`/`AppModule`.
 *
 * `ConfigModule.forRoot` is itself an `async` static method: when
 * `validate` throws, it does *not* throw synchronously — it returns a
 * rejected promise. That promise ends up in `AppModule`'s `imports` array
 * exactly as it does in production, and Nest's module resolution (whether
 * via `NestFactory.create` or, here, `Test.createTestingModule(...).compile()`)
 * awaits it and propagates the rejection — which is precisely what makes
 * `main.ts`'s `await NestFactory.create(AppModule)` reject and the process
 * refuse to start.
 */
describe('Application bootstrap fails fast on invalid configuration', () => {
  const ORIGINAL_ENV = process.env;
  const SENTINEL = 'short-SENTINEL-19chars'; // 22 chars: below the 32-char minimum, on purpose

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('rejects module compilation when HMAC_SECRET is missing', async () => {
    delete process.env.HMAC_SECRET;

    const configModule = ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    });

    await expect(
      Test.createTestingModule({ imports: [configModule] }).compile(),
    ).rejects.toThrow(/HMAC_SECRET/);
  });

  it('rejects module compilation when HMAC_SECRET is too short, never leaking it', async () => {
    process.env.HMAC_SECRET = SENTINEL;

    const configModule = ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    });

    let thrown: unknown;
    try {
      await Test.createTestingModule({ imports: [configModule] }).compile();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/HMAC_SECRET/);
    expect(message).not.toContain(SENTINEL);
  });

  it('compiles successfully with a valid HMAC_SECRET', async () => {
    process.env.HMAC_SECRET = 'a'.repeat(32);

    const configModule = ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    });

    await expect(
      Test.createTestingModule({ imports: [configModule] }).compile(),
    ).resolves.toBeDefined();
  });
});
