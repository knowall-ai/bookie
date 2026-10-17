import 'server-only';
import { BC_API } from '@/lib/connectors/bc/client';
import { ConnectorError } from '@/lib/connectors/types';
import { BC_LIVE_RESOURCES, signClientState } from './bc';
import { webhookConfig } from './config';

/**
 * Create, renew and remove Bookie's BC webhook subscriptions, as the signed-in
 * user (delegated token). Subscriptions live in BC (per environment), not in
 * Bookie: Bookie recognises its own by their notification URL.
 *
 * BC expires a subscription three days after it was created or last renewed.
 * `renewBcSubscriptions` PATCHes any of Bookie's that expire within two days;
 * the Home page's Live panel calls it (via /api/webhooks/bc/renew) whenever
 * someone in the tenant opens a BC organisation, and `ensure` recreates any
 * that BC dropped.
 */

export interface BcSubscription {
  subscriptionId: string;
  notificationUrl: string;
  resource: string;
  clientState?: string;
  expirationDateTime?: string;
  '@odata.etag'?: string;
}

export interface BcSubscriptionTarget {
  tenantId: string;
  environment: string;
  token: string;
}

/** Renew when fewer than this many ms remain (BC's lifetime is three days). */
export const RENEW_WITHIN_MS = 2 * 24 * 60 * 60_000;

function base({ tenantId, environment }: BcSubscriptionTarget) {
  return `${BC_API}/v2.0/${tenantId}/${encodeURIComponent(environment)}/api/v2.0/subscriptions`;
}

async function call<T>(
  target: BcSubscriptionTarget,
  path: string,
  init: { method?: string; body?: unknown; etag?: string } = {}
): Promise<T> {
  const response = await fetch(`${base(target)}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${target.token}`,
      Accept: 'application/json',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.etag ? { 'If-Match': init.etag } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      { error?: { message?: string } } | undefined;
    throw new ConnectorError(
      body?.error?.message?.replace(/\s*CorrelationId:[\s\S]*$/, '') ??
        `Business Central returned ${response.status} for webhook subscriptions.`,
      response.status,
      'business-central',
      body
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function bcResourcePath(companyId: string, resource: string): string {
  return `/api/v2.0/companies(${companyId})/${resource}`;
}

/** Bookie's subscriptions in one environment (matched by notification URL). */
export async function listBcSubscriptions(
  target: BcSubscriptionTarget,
  notificationUrl: string
): Promise<BcSubscription[]> {
  const result = await call<{ value: BcSubscription[] }>(target, '');
  return result.value.filter((s) => s.notificationUrl === notificationUrl);
}

function subscriptionPath(id: string) {
  return `('${encodeURIComponent(id.replace(/'/g, "''"))}')`;
}

export interface SubscriptionSummary {
  created: number;
  renewed: number;
  kept: number;
  removed: number;
}

/**
 * Make sure every company in `companyIds` has a live subscription for each of
 * salesInvoices, purchaseInvoices and customers, renewing those close to
 * expiry. Creating and renewing both trigger BC's validation handshake
 * against /api/webhooks/bc, so Bookie must be reachable on its public URL.
 */
export async function ensureBcSubscriptions(
  target: BcSubscriptionTarget,
  companyIds: string[],
  now = Date.now()
): Promise<SubscriptionSummary> {
  const config = webhookConfig();
  if (!config.bcNotificationUrl || !config.secret) {
    throw new ConnectorError(
      'Live updates for Business Central need BOOKIE_WEBHOOK_SECRET and a public HTTPS address (BOOKIE_PUBLIC_URL).',
      503,
      'business-central'
    );
  }
  const notificationUrl = config.bcNotificationUrl;
  const clientState = signClientState(target.tenantId, target.environment, config.secret);
  const existing = await listBcSubscriptions(target, notificationUrl);
  const summary: SubscriptionSummary = { created: 0, renewed: 0, kept: 0, removed: 0 };
  for (const companyId of companyIds) {
    for (const resource of BC_LIVE_RESOURCES) {
      const path = bcResourcePath(companyId, resource);
      const match = existing.find((s) => s.resource.toLowerCase() === path.toLowerCase());
      if (!match) {
        await call(target, '', {
          method: 'POST',
          body: { notificationUrl, resource: path, clientState },
        });
        summary.created += 1;
        continue;
      }
      const expires = match.expirationDateTime ? Date.parse(match.expirationDateTime) : 0;
      if (expires - now > RENEW_WITHIN_MS && match.clientState === clientState) {
        summary.kept += 1;
        continue;
      }
      await call(target, subscriptionPath(match.subscriptionId), {
        method: 'PATCH',
        etag: match['@odata.etag'] ?? '*',
        body: { notificationUrl, resource: path, clientState },
      });
      summary.renewed += 1;
    }
  }
  return summary;
}

/** Delete every Bookie subscription in the environment (Live updates turned off). */
export async function removeBcSubscriptions(
  target: BcSubscriptionTarget
): Promise<SubscriptionSummary> {
  const url = webhookConfig().bcNotificationUrl;
  const summary: SubscriptionSummary = { created: 0, renewed: 0, kept: 0, removed: 0 };
  if (!url) return summary;
  for (const s of await listBcSubscriptions(target, url)) {
    await call(target, subscriptionPath(s.subscriptionId), {
      method: 'DELETE',
      etag: s['@odata.etag'] ?? '*',
    });
    summary.removed += 1;
  }
  return summary;
}
