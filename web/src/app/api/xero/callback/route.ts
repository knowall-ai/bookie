import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/context';
import { addXeroOAuthConnection } from '@/lib/connections';
import { exchangeCode, verifyState } from '@/lib/connectors/xero/oauth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (status: string) => {
    const response = NextResponse.redirect(new URL(`/portal/settings?xero=${status}`, request.url));
    response.cookies.delete({ name: 'bookie_xero_nonce', path: '/api/xero' });
    return response;
  };
  const auth = await getAuthContext();
  if (!auth)
    return NextResponse.redirect(new URL('/signin?callbackUrl=/portal/settings', request.url));
  if (url.searchParams.get('error')) return back('cancelled');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const nonce = (await cookies()).get('bookie_xero_nonce')?.value;
  if (
    !code ||
    !state ||
    !verifyState(state, { tenantId: auth.user.tenantId, userId: auth.user.id, nonce })
  ) {
    return back('invalid');
  }
  try {
    await addXeroOAuthConnection(auth, await exchangeCode(code));
    return back('connected');
  } catch (error) {
    console.error('[bookie] Xero OAuth callback failed', error);
    return back('failed');
  }
}
