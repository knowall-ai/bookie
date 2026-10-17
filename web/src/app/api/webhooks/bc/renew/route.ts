import { NextResponse } from 'next/server';
import { canManageSettings } from '@/lib/auth/access';
import { getAuthContext } from '@/lib/auth/context';
import { listOrgs } from '@/lib/connectors/registry';
import { isConnectorError } from '@/lib/connectors/types';
import { bcWebhooksConfigured } from '@/lib/webhooks/config';
import { syncBcLiveUpdates } from '@/lib/webhooks/bc-live';

export const dynamic = 'force-dynamic';

/**
 * Renew the signed-in tenant's Business Central webhook subscriptions (BC
 * expires them after three days) and recreate any BC dropped. Runs as the
 * signed-in user, because BC subscriptions need a delegated BC token; the Live
 * panel calls it when someone opens a BC organisation. See docs/WEBHOOKS.adoc.
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  // Subscriptions are tenant-wide settings: guests leave them to the host's members.
  if (!canManageSettings(auth.user)) {
    return NextResponse.json({ error: 'Members only.' }, { status: 403 });
  }
  if (!bcWebhooksConfigured()) {
    return NextResponse.json({ error: 'Live updates are not configured.' }, { status: 503 });
  }
  const { settings } = await listOrgs(auth);
  if (!settings?.businessCentral.liveUpdates) {
    return NextResponse.json({ enabled: false });
  }
  try {
    const summary = await syncBcLiveUpdates(auth, true);
    return NextResponse.json({ enabled: true, ...summary });
  } catch (error) {
    const status = isConnectorError(error) ? error.status : 500;
    return NextResponse.json(
      { error: isConnectorError(error) ? error.message : 'Could not renew live updates.' },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}
