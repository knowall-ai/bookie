import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { SIGN_IN_SCOPES, signInAuthority } from './resources';

function decodeJwtPayload(jwt: string | undefined): Record<string, unknown> {
  if (!jwt) return {};
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * Microsoft Entra sign-in. The JWT session cookie is encrypted (JWE) and holds
 * the refresh token; the refresh token is never copied into the client-visible
 * session object.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: signInAuthority(),
      authorization: { params: { scope: SIGN_IN_SCOPES, prompt: 'select_account' } },
      // Graph photos can be large; we render initials instead.
      profilePhotoSize: 48,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/signin' },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        const claims = decodeJwtPayload(account.id_token);
        token.refreshToken = account.refresh_token;
        token.tenantId = (claims.tid as string) ?? undefined;
        token.oid = (claims.oid as string) ?? undefined;
        token.picture = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        ...session.user,
        id: (token.oid as string) ?? token.sub ?? '',
        tenantId: (token.tenantId as string) ?? '',
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
