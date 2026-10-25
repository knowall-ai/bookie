import { describe, expect, it, vi } from 'vitest';
import { encode } from 'next-auth/jwt';

vi.mock('server-only', () => ({}));
const { readSessionToken } = await import('./session-cookie');

/* Fictional values only. */
const secret = 'test-secret-'.repeat(4);
const claims = (refreshToken: string) => ({
  name: 'Sam Example',
  email: 'sam@contoso.example',
  refreshToken,
  tenantId: '11111111-2222-3333-4444-555555555555',
  oid: '00000000-0000-0000-0000-00000000d303',
  userType: 'Member' as const,
});

/**
 * The cookies next-auth sets for this value, as `SessionStore.chunk` does
 * (node_modules/next-auth/core/lib/cookie.js, not exported): one cookie, or
 * `<name>.0`, `<name>.1`… of 4096 - 163 characters each when it's larger.
 */
const CHUNK_SIZE = 4096 - 163;
function cookiesFor(name: string, value: string) {
  if (value.length <= CHUNK_SIZE) return [{ name, value }];
  return Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, i) => ({
    name: `${name}.${i}`,
    value: value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
  }));
}

describe('readSessionToken', () => {
  it('reads an ordinary single session cookie', async () => {
    const value = await encode({ token: claims('r'.repeat(1200)), secret });
    const cookies = cookiesFor('__Secure-next-auth.session-token', value);
    expect(cookies.map((c) => c.name)).toEqual(['__Secure-next-auth.session-token']);
    expect((await readSessionToken(cookies, secret))?.oid).toBe(claims('').oid);
  });

  it('puts back together a session next-auth split because a long refresh token made it large', async () => {
    const value = await encode({ token: claims('r'.repeat(3000)), secret });
    const cookies = cookiesFor('__Secure-next-auth.session-token', value);
    expect(cookies.map((c) => c.name)).toEqual([
      '__Secure-next-auth.session-token.0',
      '__Secure-next-auth.session-token.1',
    ]);
    // Cookie order in the request doesn't matter.
    const token = await readSessionToken([...cookies].reverse(), secret);
    expect(token?.refreshToken).toBe('r'.repeat(3000));
  });

  it('reads the plain cookie name used over http in local development, split or not', async () => {
    const value = await encode({ token: claims('r'.repeat(3000)), secret });
    const token = await readSessionToken(cookiesFor('next-auth.session-token', value), secret);
    expect(token?.tenantId).toBe(claims('').tenantId);
  });

  it('is null with no session cookie, a wrong secret, or a missing piece', async () => {
    expect(await readSessionToken([{ name: 'other', value: 'x' }], secret)).toBeNull();
    const value = await encode({ token: claims('r'.repeat(3000)), secret });
    const cookies = cookiesFor('__Secure-next-auth.session-token', value);
    expect(await readSessionToken(cookies, 'another-secret-'.repeat(3))).toBeNull();
    expect(await readSessionToken(cookies.slice(0, 1), secret)).toBeNull();
  });
});
