import type { Config } from 'jest';

// Shared transform/module settings for every project.
const base: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  // Runs before any module is imported, so `AppModule`'s import-time
  // `ConfigModule.forRoot()` validation always sees a valid environment.
  setupFiles: ['<rootDir>/src/testing/jest-setup-env.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
};

const config: Config = {
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.test.ts',
    '!src/main.ts',
    '!src/testing/**',
  ],
  coverageDirectory: 'coverage',
  projects: [
    {
      ...base,
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/src/.*/test/',
      ],
    },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/src/**/test/*.integration.test.ts'],
    },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/*.e2e.test.ts'],
    },
  ],
};

export default config;
