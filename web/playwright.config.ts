import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the fictional demo organisations only
 * (BOOKIE_DEV_AUTH=demo), never real books. Set BASE_URL to point at an
 * already-running server; otherwise Playwright starts one on port 3120.
 *
 * The guest specs (*.guest.spec.ts) need a second server signed in as the demo
 * guest accountant (BOOKIE_DEV_AUTH=demo-guest): GUEST_BASE_URL, or one that
 * Playwright starts on port 3121.
 *
 * The approved-organisations spec needs a third server signed in as a user from
 * an organisation that isn't approved (BOOKIE_DEV_AUTH=demo-unapproved):
 * UNAPPROVED_BASE_URL, or one that Playwright starts on port 3122.
 */
const PORT = 3120;
const GUEST_PORT = 3121;
const UNAPPROVED_PORT = 3122;
const baseURL = process.env.BASE_URL ?? `http://localhost:${PORT}`;
const guestBaseURL = process.env.GUEST_BASE_URL ?? `http://localhost:${GUEST_PORT}`;
const unapprovedBaseURL = process.env.UNAPPROVED_BASE_URL ?? `http://localhost:${UNAPPROVED_PORT}`;

const serverEnv = (url: string, auth: string, distDir: string) => ({
  NEXT_DIST_DIR: distDir,
  BOOKIE_DEV_AUTH: auth,
  BOOKIE_CONFIG_STORE: 'file',
  // Bookie's take and chat would call Azure OpenAI from .env.local: keep e2e offline.
  BOOKIE_DISABLE_AI: '1',
  BOOKIE_E2E: '1',
  NEXTAUTH_URL: url,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'e2e-only-secret-not-used-in-production',
  BOOKIE_CONFIG_KEY: process.env.BOOKIE_CONFIG_KEY ?? Buffer.alloc(32, 7).toString('base64'),
});

const servers = [
  ...(process.env.BASE_URL
    ? []
    : [
        {
          command: `bunx next dev --port ${PORT}`,
          url: `${baseURL}/`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: serverEnv(baseURL, 'demo', '.next-e2e'),
        },
      ]),
  ...(process.env.GUEST_BASE_URL
    ? []
    : [
        {
          command: `bunx next dev --port ${GUEST_PORT}`,
          url: `${guestBaseURL}/`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: serverEnv(guestBaseURL, 'demo-guest', '.next-e2e-guest'),
        },
      ]),
  ...(process.env.UNAPPROVED_BASE_URL
    ? []
    : [
        {
          command: `bunx next dev --port ${UNAPPROVED_PORT}`,
          url: `${unapprovedBaseURL}/`,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: serverEnv(unapprovedBaseURL, 'demo-unapproved', '.next-e2e-unapproved'),
        },
      ]),
];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One dev server shares demo state; more workers make slow compiles time out.
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: servers.length ? servers : undefined,
});
