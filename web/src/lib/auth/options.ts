import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import type { UserType } from './access';
import { normaliseTenantId } from './approved-tenants';
import { guestTenants } from './guest-tenants';
import { SIGN_IN_SCOPES, signInAuthority } from './resources';

function decodeJwtPayload(jwt: string | undefined): Record<string, unknown> {
  if (!jwt) return {};
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

function entraProvider(id: string, name: string, tenantId: string) {
  return AzureADProvider({
    id,
    name,
    clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
    tenantId,
    authorization: { params: { scope: SIGN_IN_SCOPES, prompt: 'select_account' } },
    // Keep the photo out of the session cookie (too large); the top bar loads it from /api/me/photo.
    profilePhotoSize: 48,
  });
}

/** `john_example.com#EXT#@host.onmicrosoft.com` → `john@example.com`; other UPNs unchanged. */
export function externalUpnToEmail(upn: string): string {
  const match = /^(.+)_([^_]+)#EXT#@/i.exec(upn);
  return match ? `${match[1]}@${match[2]}` : upn;
}

export interface SignInIdentity {
  userType: UserType;
  email: string;
}

interface GraphMe {
  userType?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
}

/**
 * Member or guest, from Graph `/me` (`null` when the call failed).
 *
 * Accounts created before Entra recorded `userType` can have it blank; Microsoft
 * treats those as members, but only when the UPN isn't a B2B guest's `#EXT#` one.
 * Anything else, or no answer from Graph, is a guest (fail closed).
 */
export function resolveUserType(me: GraphMe | null): UserType {
  if (!me) return 'Guest';
  if (me.userType === 'Member') return 'Member';
  if (me.userType == null && me.userPrincipalName && !/#EXT#/i.test(me.userPrincipalName)) {
    return 'Member';
  }
  return 'Guest';
}

/**
 * Who signed in, from Microsoft Graph with the sign-in token (User.Read).
 * `userType` decides whether access entries apply; when Graph can't say, the
 * user is treated as a guest (fail closed: they see only what they're granted).
 */
export async function signInIdentity(
  accessToken: string | undefined,
  claims: Record<string, unknown>
): Promise<SignInIdentity> {
  let me: GraphMe | null = null;
  if (accessToken) {
    try {
      const response = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=userType,mail,userPrincipalName',
        { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' }
      );
      if (response.ok) me = (await response.json()) as GraphMe;
      else console.error('[bookie] Graph /me failed at sign-in', response.status);
    } catch (error) {
      console.error('[bookie] Graph /me failed at sign-in', error);
    }
  }
  const email =
    me?.mail ||
    (claims.email as string | undefined) ||
    (claims.preferred_username as string | undefined) ||
    (me?.userPrincipalName ? externalUpnToEmail(me.userPrincipalName) : '');
  return { userType: resolveUserType(me), email: email ?? '' };
}

/**
 * Microsoft Entra sign-in. The JWT session cookie is encrypted (JWE) and holds
 * the refresh token; the refresh token is never copied into the client-visible
 * session object.
 *
 * `azure-ad` signs in to the user's home tenant. Each BOOKIE_GUEST_TENANTS
 * entry adds a provider for that host tenant, so a guest (an external
 * accountant) gets a token for the host organisation, not their own firm.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    entraProvider('azure-ad', 'Microsoft', signInAuthority()),
    ...guestTenants().map((t) => entraProvider(t.providerId, t.name, t.tenantId)),
  ],
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/signin' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        const claims = decodeJwtPayload(account.id_token);
        const identity = await signInIdentity(account.access_token, claims);
        token.refreshToken = account.refresh_token;
        // Lowercased, and only when it is a real GUID: a missing or malformed `tid` is never approved.
        token.tenantId = normaliseTenantId(claims.tid);
        token.oid = (claims.oid as string) ?? undefined;
        token.userType = identity.userType;
        token.email = identity.email || token.email;
        token.picture = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: (token.oid as string) ?? token.sub ?? '',
        tenantId: (token.tenantId as string) ?? '',
        email: token.email ?? session.user?.email,
        userType: token.userType,
        image: undefined,
      };
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/portal`;
    },
  },
};
