import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { isApprovedTenant } from './approved-tenants';
import { DEMO_TENANT_ID, devAuthMode, devAuthContext } from './dev';
import { readSessionToken } from './session-cookie';
import { redeemRefreshToken } from './tokens';
import type { UserType } from './access';
import type { ResourceName } from './resources';

export interface BookieUser {
  /** Entra object id. */
  id: string;
  /** Entra tenant id: the isolation boundary for every connection and setting. */
  tenantId: string;
  name: string;
  email: string;
  /** Entra `userType`: guests (B2B, e.g. an external accountant) see only organisations they're granted. */
  userType: UserType;
}

export interface AuthContext {
  mode: 'entra' | 'azure-cli' | 'demo';
  user: BookieUser;
  /** Delegated access token for a Microsoft resource, as the signed-in user. */
  getToken(resource: ResourceName): Promise<string>;
}

/**
 * Whoever signed in, whether or not their organisation is approved, or `null`.
 * Only for the "not set up yet" page and for telling an unapproved sign-in
 * from no sign-in: everything that reads data uses `getAuthContext`.
 */
export const getSignIn = cache(async (): Promise<AuthContext | null> => {
  const dev = devAuthMode();
  if (dev) return devAuthContext(dev);

  const jar = await cookies();
  // Reassembles next-auth's split cookie (`.0`, `.1`…) when the session is large.
  const token = await readSessionToken(jar.getAll());
  // Sessions from before userType was recorded sign in again rather than guess it.
  if (!token?.refreshToken || !token.tenantId || !token.oid || !token.userType) return null;

  const { refreshToken, tenantId } = token;
  return {
    mode: 'entra',
    user: {
      id: token.oid,
      tenantId,
      name: token.name ?? token.email ?? 'Signed-in user',
      email: token.email ?? '',
      userType: token.userType,
    },
    getToken: (resource) => redeemRefreshToken(tenantId, refreshToken, resource),
  };
});

/**
 * Whether this sign-in's organisation may use Bookie (`approved-tenants.ts`).
 * The fictional demo tenant is approved too; demo sign-ins are refused in production.
 */
export function isApprovedSignIn(auth: AuthContext): boolean {
  if (auth.mode === 'demo' && auth.user.tenantId === DEMO_TENANT_ID) return true;
  return isApprovedTenant(auth.user.tenantId);
}

/**
 * The signed-in user for this request, or `null` when nobody is signed in or
 * their organisation isn't approved. Every page, route and action that reads or
 * writes data goes through this (or `requireAuth`), so an unapproved
 * organisation gets no data and API routes answer 401. Memoised per request.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const auth = await getSignIn();
  return auth && isApprovedSignIn(auth) ? auth : null;
});

/**
 * Like `getAuthContext`, but sends anonymous visitors to sign in and people
 * from an organisation that isn't approved to the "not set up yet" page.
 */
export async function requireAuth(returnTo = '/portal'): Promise<AuthContext> {
  const auth = await getAuthContext();
  if (auth) return auth;
  if (await getSignIn()) redirect('/not-approved');
  redirect(`/signin?callbackUrl=${encodeURIComponent(returnTo)}`);
}
