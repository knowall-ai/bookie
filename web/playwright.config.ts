import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the fictional demo organisations only
 * (BOOKIE_DEV_AUTH=demo), never real books. Set BASE_URL to point at an
 * already-running server; otherwise Playwright starts one on port 3120.
 */
const PORT = 3120;
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `bunx next dev --port ${PORT}`,
        url: `${baseURL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: {
          BOOKIE_DEV_AUTH: 'demo',
          BOOKIE_CONFIG_STORE: 'file',
          NEXTAUTH_URL: baseURL,
          NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'e2e-only-secret-not-used-in-production',
          BOOKIE_CONFIG_KEY: process.env.BOOKIE_CONFIG_KEY ?? Buffer.alloc(32, 7).toString('base64'),
        },
      },
});
