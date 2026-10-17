import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a dev server started with BOOKIE_DEV_AUTH=demo
 * (the fictional demo organisations). Point BASE_URL at it.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3103',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
