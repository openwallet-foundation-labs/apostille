import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: require.resolve('jest-environment-jsdom'),
  testMatch: ['**/__tests__/**/?(*.)test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
