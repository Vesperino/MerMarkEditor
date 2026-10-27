import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:1421',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Linux and macOS print through WebKit, so paged print output is checked there too.
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: /pdf-pagination\.test\.ts/,
    },
  ],

  webServer: {
    command: 'pnpm vite --port 1421',
    url: 'http://localhost:1421',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
