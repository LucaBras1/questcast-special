import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/ai-quality/', // AI quality tests require real API; run separately
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1', // Strip .js extensions for ESM-style imports in ts-jest
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'json', 'html'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  // Timeout for individual tests (10 seconds -- generous for CI)
  testTimeout: 10000,
  // Verbose output for CI readability
  verbose: true,
};

export default config;
