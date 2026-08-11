import { validateEnv } from './env.schema';

const VALID_SECRET = 'a'.repeat(32);

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    HMAC_SECRET: VALID_SECRET,
    ...overrides,
  };

  // Drop keys explicitly set to `undefined` so they are actually absent,
  // mirroring how a real environment object behaves.
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) {
      delete env[key];
    }
  }

  return env;
}

describe('validateEnv', () => {
  it('accepts a valid, complete environment and returns correctly typed values', () => {
    const result = validateEnv(
      baseEnv({
        PORT: '4000',
        NODE_ENV: 'production',
        LOG_LEVEL: 'debug',
      }),
    );

    expect(result).toEqual({
      HMAC_SECRET: VALID_SECRET,
      PORT: 4000,
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
    });
    expect(typeof result.PORT).toBe('number');
  });

  it('applies default values when optional variables are absent', () => {
    const result = validateEnv(baseEnv());

    expect(result.PORT).toBe(3000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.LOG_LEVEL).toBe('log');
  });

  describe('HMAC_SECRET', () => {
    it('rejects a missing HMAC_SECRET, naming the variable', () => {
      const env = baseEnv();
      delete env.HMAC_SECRET;

      expect(() => validateEnv(env)).toThrow(/HMAC_SECRET/);
    });

    it('rejects a secret of 31 characters (below the boundary)', () => {
      expect(() =>
        validateEnv(baseEnv({ HMAC_SECRET: 'a'.repeat(31) })),
      ).toThrow(/HMAC_SECRET/);
    });

    it('accepts a secret of exactly 32 characters (at the boundary)', () => {
      expect(() =>
        validateEnv(baseEnv({ HMAC_SECRET: 'a'.repeat(32) })),
      ).not.toThrow();
    });

    it('never leaks the secret value in the thrown error message', () => {
      const sentinel = 'tooshort-SENTINEL';

      let thrown: unknown;
      try {
        validateEnv(baseEnv({ HMAC_SECRET: sentinel }));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      const message = (thrown as Error).message;
      expect(message).not.toContain(sentinel);
      expect(message).toMatch(/HMAC_SECRET/);
    });
  });

  describe('PORT', () => {
    it('rejects a non-numeric PORT', () => {
      expect(() => validateEnv(baseEnv({ PORT: 'abc' }))).toThrow(/PORT/);
    });

    it('rejects PORT = 0', () => {
      expect(() => validateEnv(baseEnv({ PORT: '0' }))).toThrow(/PORT/);
    });

    it('rejects PORT = 65536', () => {
      expect(() => validateEnv(baseEnv({ PORT: '65536' }))).toThrow(/PORT/);
    });

    it('accepts PORT = 1 (lower boundary)', () => {
      const result = validateEnv(baseEnv({ PORT: '1' }));
      expect(result.PORT).toBe(1);
    });

    it('accepts PORT = 65535 (upper boundary)', () => {
      const result = validateEnv(baseEnv({ PORT: '65535' }));
      expect(result.PORT).toBe(65535);
    });
  });

  describe('NODE_ENV', () => {
    it('rejects an invalid NODE_ENV value', () => {
      expect(() => validateEnv(baseEnv({ NODE_ENV: 'staging' }))).toThrow(
        /NODE_ENV/,
      );
    });
  });
});
