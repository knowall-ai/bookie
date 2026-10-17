import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import type { TenantSettings } from '@/lib/config/types';
import { listOrgs } from '@/lib/connectors/registry';
import type { OrgRef } from '@/lib/domain/types';
import { bcWebhooksConfigured, webhookConfig } from './config';
import { sourceKeyForOrg } from './events';

/**
 * Is the Live panel switched on for this org? It is a feature flag on the
 * webhook setup: off unless the source can actually push events here.
 * - Xero: XERO_WEBHOOK_KEY is set (Bookie's app has webhooks in the developer portal).
 * - Business Central: BC webhooks are configured and the tenant turned on Live updates.
 * - Demo: always (the demo books publish their own events when you change them).
 * BOOKIE_LIVE_FEED=off turns it off everywhere.
 */
export function liveFeedEnabled(org: OrgRef, settings?: TenantSettings): boolean {
  const config = webhookConfig();
  if (config.liveFeedOff) return false;
  if (org.kind === 'demo') return true;
  if (org.kind === 'xero') return !!config.xeroKey;
  return bcWebhooksConfigured(config) && !!settings?.businessCentral.liveUpdates;
}

/**
 * Resolve an org key from the URL to the org and its event source key, for
 * the signed-in user only. Unknown or foreign keys resolve to undefined.
 */
export async function liveSource(
  auth: AuthContext,
  orgKey: string
): Promise<{ org: OrgRef; key: string; enabled: boolean } | undefined> {
  const { orgs, settings } = await listOrgs(auth);
  const org = orgs.find((o) => o.key === orgKey);
  if (!org) return undefined;
  const key = sourceKeyForOrg(org, auth.user.tenantId);
  if (!key) return undefined;
  return { org, key, enabled: liveFeedEnabled(org, settings) };
}
