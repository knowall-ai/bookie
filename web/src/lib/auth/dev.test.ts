import { afterEach, describe, expect, it, vi } from 'vitest';
import { devAuthMode } from './dev';

/**
 * The demo connector (fictional books) is only reachable through
 * BOOKIE_DEV_AUTH=demo, so a production build must refuse the shortcut.
 */
describe('dev sign-in shortcuts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('throws in production for the demo and azure-cli modes', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const mode of ['demo', 'demo-guest', 'azure-cli']) {
      vi.stubEnv('BOOKIE_DEV_AUTH', mode);
      expect(() => devAuthMode()).toThrow(/must not be set in production/);
    }
  });

  it('is off when unset, in production too', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BOOKIE_DEV_AUTH', '');
    expect(devAuthMode()).toBeNull();
  });

  it('allows the demo mode in development and rejects unknown modes', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('BOOKIE_DEV_AUTH', 'demo');
    expect(devAuthMode()).toBe('demo');
    vi.stubEnv('BOOKIE_DEV_AUTH', 'demo-guest');
    expect(devAuthMode()).toBe('demo-guest');
    vi.stubEnv('BOOKIE_DEV_AUTH', 'admin');
    expect(() => devAuthMode()).toThrow(/Unknown BOOKIE_DEV_AUTH/);
  });
});
