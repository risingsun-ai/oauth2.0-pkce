// jest.config.ts
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/backend/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Increase timeout for async operations like Redis mocks
  testTimeout: 30000,
};
export default config;
