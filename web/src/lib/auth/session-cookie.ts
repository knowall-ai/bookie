import 'server-only';
import { getToken, type JWT } from 'next-auth/jwt';

/**
 * next-auth's session cookie name, chosen the way next-auth chooses it when writing:
 * `__Secure-` when NEXTAUTH_URL is https, the plain name over http (local development).
 * Only that one is read, so a plain-named cookie planted over http is never used in production.
 */
export function sessionCookieName(url = process.env.NEXTAUTH_URL): string {
  return url?.startsWith('https://')
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';
}

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
  { secret = process.env.NEXTAUTH_SECRET ?? '', cookieName = sessionCookieName() } = {}
): Promise<JWT | null> {
  const cookies = Object.fromEntries(all.map((c) => [c.name, c.value]));
  // No headers: the session only ever comes from the cookie, never an Authorization header.
  // getToken returns null for a missing or undecryptable cookie.
  return getToken({
    req: { cookies, headers: {} } as unknown as Parameters<typeof getToken>[0]['req'],
    cookieName,
    secret,
  });
}
