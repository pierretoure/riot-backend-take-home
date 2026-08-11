import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../env.schema';

describe('Application bootstrap fails fast on invalid configuration', () => {
  const ORIGINAL_ENV = process.env;
  const SENTINEL = 'short-SENTINEL-19chars'; // 22 chars: below the 32-char minimum, on purpose

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('rejects module compilation when SIGNER_SECRET is missing', async () => {
    delete process.env.SIGNER_SECRET;

    const configModule = ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    });

    await expect(
      Test.createTestingModule({ imports: [configModule] }).compile(),
    ).rejects.toThrow(/SIGNER_SECRET/);
  });

  it('rejects module compilation when SIGNER_SECRET is too short, never leaking it', async () => {
    process.env.SIGNER_SECRET = SENTINEL;

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
    expect(message).toMatch(/SIGNER_SECRET/);
    expect(message).not.toContain(SENTINEL);
  });

  it('compiles successfully with a valid SIGNER_SECRET', async () => {
    process.env.SIGNER_SECRET = 'a'.repeat(32);

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
