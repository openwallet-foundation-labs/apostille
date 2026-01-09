import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)e2e.test.ts'],
  maxWorkers: 1,
  setupFilesAfterEnv: ['./src/testSetup.ts'],
  testTimeout: 30000,
}

export default config
