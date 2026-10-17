import 'server-only';
import { headers } from 'next/headers';

/** Bookie's multi-tenant Entra app registration (public: it appears in every consent URL). */
export const BOOKIE_CLIENT_ID = '70f4600b-018e-4e11-9b89-16d2922a3fff';

/**
 * The site's public origin. Production trusts NEXTAUTH_URL (the redirect URI
 * registered in Entra); development follows the request host so any local
 * port works.
 */
export async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXTAUTH_URL;
  if (configured && process.env.NODE_ENV === 'production') return new URL(configured).origin;

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return configured ? new URL(configured).origin : 'https://getbook.ie';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Microsoft's admin-consent URL for installing Bookie in an organisation. */
export function adminConsentUrl(origin: string): string {
  const url = new URL('https://login.microsoftonline.com/organizations/adminconsent');
  url.searchParams.set('client_id', BOOKIE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${origin}/install/complete`);
  return url.toString();
}
