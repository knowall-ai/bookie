import 'server-only';
import { cookies } from 'next/headers';
import { decode } from 'next-auth/jwt';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { devAuthMode, devAuthContext } from './dev';
import { redeemRefreshToken } from './tokens';
import type { ResourceName } from './resources';

export interface BookieUser {
  /** Entra object id. */
  id: string;
  /** Entra tenant id: the isolation boundary for every connection and setting. */
  tenantId: string;
  name: string;
  email: string;
}

export interface AuthContext {
  mode: 'entra' | 'azure-cli' | 'demo';
  user: BookieUser;
  /** Delegated access token for a Microsoft resource, as the signed-in user. */
  getToken(resource: ResourceName): Promise<string>;
}

const SESSION_COOKIES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

/** The signed-in user for this request, or `null`. Memoised per request. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const dev = devAuthMode();
  if (dev) return devAuthContext(dev);

  const jar = await cookies();
  const raw = SESSION_COOKIES.map((name) => jar.get(name)?.value).find(Boolean);
  if (!raw) return null;

  const token = await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET ?? '' }).catch(
    () => null
  );
  if (!token?.refreshToken || !token.tenantId || !token.oid) return null;

  const { refreshToken, tenantId } = token;
  return {
    mode: 'entra',
    user: {
      id: token.oid,
      tenantId,
      name: token.name ?? token.email ?? 'Signed-in user',
      email: token.email ?? '',
    },
    getToken: (resource) => redeemRefreshToken(tenantId, refreshToken, resource),
  };
});

/** Like `getAuthContext`, but sends anonymous visitors to sign in. */
export async function requireAuth(returnTo = '/portal'): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (!auth) redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
  return auth;
}
