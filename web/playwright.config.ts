import { defineConfig } from '@playwright/test';

/** E2E runs against the demo organisations: start the app with BOOKIE_DEV_AUTH=demo. */
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3103' },
});
