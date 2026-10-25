import 'server-only';
import { getToken, type JWT } from 'next-auth/jwt';

/** next-auth's session cookie: `__Secure-` on https, the plain name on http (local development). */
export const SESSION_COOKIES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

/**
 * The decoded next-auth session token from the request's cookies, or `null`.
 *
 * next-auth splits a session cookie bigger than about 4 KB into `<name>.0`, `<name>.1`…
 * (Bookie's token holds the Microsoft refresh token, which can push it over), so the
 * cookie isn't read by name: next-auth's own `getToken` puts the pieces back together.
 * Not `getServerSession`: that only returns what the `session` callback exposes, which
 * deliberately leaves out the refresh token.
 */
export async function readSessionToken(
  all: { name: string; value: string }[],
  secret = process.env.NEXTAUTH_SECRET ?? ''
): Promise<JWT | null> {
  const cookies = Object.fromEntries(all.map((c) => [c.name, c.value]));
  for (const cookieName of SESSION_COOKIES) {
    // No headers: the session only ever comes from the cookie, never an Authorization header.
    const token = await getToken({
      req: { cookies, headers: {} } as unknown as Parameters<typeof getToken>[0]['req'],
      cookieName,
      secureCookie: cookieName.startsWith('__Secure-'),
      secret,
      logger: { error: () => {}, warn: () => {}, debug: () => {} },
    }).catch(() => null);
    if (token) return token;
  }
  return null;
}
