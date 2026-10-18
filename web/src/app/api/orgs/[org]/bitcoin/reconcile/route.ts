import { NextResponse } from 'next/server';
import { bookieContext, rateLimit } from '@/lib/bookie/session';
import { reconcileAllWallets } from '@/lib/bitcoin/reconcile-service';
import { isConnectorError } from '@/lib/connectors/types';

export const dynamic = 'force-dynamic';

/**
 * The Bitcoin reconcile for one organisation, as JSON: the same summary Bookie's
 * `reconcile_bitcoin_wallets` tool returns. Read-only, as the signed-in user, with
 * the organisation re-checked against what they may open. `?wallet=` picks one.
 */
export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const context = await bookieContext(decodeURIComponent(orgParam));
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  const { auth, org, connector } = context;
  if (!org || !connector)
    return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 });
  if (!rateLimit(`btc-reconcile:${auth.user.tenantId}:${auth.user.id}`, 10)) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429 }
    );
  }
  const wallet = new URL(request.url).searchParams.get('wallet')?.slice(0, 120) || undefined;
  try {
    const summary = await reconcileAllWallets(auth, { org, connector }, wallet);
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const status = isConnectorError(error) ? error.status : 500;
    if (!isConnectorError(error)) console.error('[bookie] bitcoin reconcile API failed', error);
    return NextResponse.json(
      { error: isConnectorError(error) ? error.message : 'The reconcile failed.' },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
