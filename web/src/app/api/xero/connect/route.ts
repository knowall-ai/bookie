import { NextResponse } from 'next/server';
import { canManageSettings } from '@/lib/auth/access';
import { getAuthContext } from '@/lib/auth/context';
import { authorizeUrl, createState, xeroOAuthConfigured } from '@/lib/connectors/xero/oauth';

/** Start "Connect to Xero". The nonce cookie ties the callback to this browser. */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth)
    return NextResponse.redirect(new URL('/signin?callbackUrl=/portal/settings', request.url));
  // Guests see Settings' "ask an administrator" page instead.
  if (!canManageSettings(auth.user))
    return NextResponse.redirect(new URL('/portal/settings', request.url));
  if (!xeroOAuthConfigured())
    return NextResponse.redirect(new URL('/portal/settings?xero=not-configured', request.url));
  const { state, nonce } = createState(auth.user.tenantId, auth.user.id);
  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set('bookie_xero_nonce', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/api/xero',
  });
  return response;
}
