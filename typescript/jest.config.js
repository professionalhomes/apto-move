/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  verbose: true,
  transform: {
    '^.+\\\\.ts?$': 'ts-jest',
  },
  moduleNameMapper: {
    '@/(.*)$': '<rootDir>/src/$1',
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
};
