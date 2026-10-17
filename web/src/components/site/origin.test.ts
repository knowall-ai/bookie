import { afterEach, describe, expect, it, vi } from 'vitest';

const headerMap = new Map<string, string>();
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => headerMap.get(k) ?? null }),
}));

const { adminConsentUrl, siteOrigin, BOOKIE_CLIENT_ID } = await import('./origin');

afterEach(() => {
  headerMap.clear();
  vi.unstubAllEnvs();
});

describe('adminConsentUrl', () => {
  it('points at the organisations admin-consent endpoint with our client id and callback', () => {
    const url = new URL(adminConsentUrl('https://getbook.ie'));
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/organizations/adminconsent'
    );
    expect(url.searchParams.get('client_id')).toBe(BOOKIE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('https://getbook.ie/install/complete');
  });
});

describe('siteOrigin', () => {
  it('trusts NEXTAUTH_URL in production, ignoring the request host', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXTAUTH_URL', 'https://getbook.ie/');
    headerMap.set('host', 'evil.example.com');
    expect(await siteOrigin()).toBe('https://getbook.ie');
  });

  it('follows the request host in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3103');
    headerMap.set('host', 'localhost:3116');
    expect(await siteOrigin()).toBe('http://localhost:3116');
  });

  it('honours forwarded host and protocol behind a proxy', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    headerMap.set('x-forwarded-host', 'preview.example.com');
    headerMap.set('x-forwarded-proto', 'https');
    expect(await siteOrigin()).toBe('https://preview.example.com');
  });
});
