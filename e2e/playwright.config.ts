import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  globalSetup: path.resolve(__dirname, 'global-setup.ts'),
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      // Start backend with DATABASE_URL pointing to local postgres container
      command: 'npx dotenv-cli -e .env -- yarn dev:backend',
      cwd: path.resolve(__dirname, '..'),
      port: 3002,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        DB_HOST: 'localhost',
        DB_PASSWORD: 'localdevpassword123',
        DATABASE_URL: process.env.DATABASE_URL ||
          'postgresql://postgres:localdevpassword123@localhost:5432/verifiable_ai',
      },
    },
    {
      command: 'PORT=3000 yarn dev:frontend',
      cwd: path.resolve(__dirname, '..'),
      port: 3000,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
