import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1895',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm dev:backend',
      url: 'http://localhost:1894/api/swagger.json',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'pnpm dev:web',
      url: 'http://localhost:1895',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
