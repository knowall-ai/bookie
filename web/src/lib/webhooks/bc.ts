import { createHmac, timingSafeEqual } from 'node:crypto';
import { bcSourceKey, publish, type LiveChange, type LiveEvent } from './events';

/**
 * Business Central webhooks (API v2.0 `subscriptions`).
 *
 * - Handshake: when a subscription is created or renewed, BC calls the
 *   notification URL with `?validationToken=...` and expects that token back
 *   as the body with 200.
 * - Notifications carry no signature. Instead each subscription has a
 *   `clientState` that BC echoes on every notification; Bookie makes it an
 *   HMAC over the Entra tenant and environment, so a notification proves which
 *   tenant it belongs to and can't be forged without BOOKIE_WEBHOOK_SECRET.
 * - Notifications name the record by URL only:
 *   `api/v2.0/companies({companyId})/salesInvoices({id})`.
 */

export const BC_LIVE_RESOURCES = ['salesInvoices', 'purchaseInvoices', 'customers'] as const;
export type BcLiveResource = (typeof BC_LIVE_RESOURCES)[number];

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TENANT = new RegExp(`^${GUID}$`, 'i');

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function mac(secret: string, tenantId: string, environment: string): string {
  return createHmac('sha256', secret)
    .update(`bookie-bc-webhook|v1|${tenantId.toLowerCase()}|${environment}`)
    .digest('base64url');
}

/** `v1.{tenantId}.{base64url(environment)}.{hmac}`: well under BC's 2,048 limit. */
export function signClientState(tenantId: string, environment: string, secret: string): string {
  return `v1.${tenantId.toLowerCase()}.${b64url(environment)}.${mac(secret, tenantId, environment)}`;
}

export function verifyClientState(
  clientState: string | undefined,
  secret: string | undefined
): { tenantId: string; environment: string } | undefined {
  if (!clientState || !secret || clientState.length > 2048) return undefined;
  const [version, tenantId, env64, signature, extra] = clientState.split('.');
  if (version !== 'v1' || extra !== undefined || !tenantId || !env64 || !signature)
    return undefined;
  if (!TENANT.test(tenantId)) return undefined;
  const environment = Buffer.from(env64, 'base64url').toString('utf8');
  if (!environment || !/^[\w-]{1,64}$/.test(environment)) return undefined;
  const expected = Buffer.from(mac(secret, tenantId, environment));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
  return { tenantId: tenantId.toLowerCase(), environment };
}

export interface BcNotification {
  subscriptionId?: string;
  clientState?: string;
  expirationDateTime?: string;
  resource?: string;
  changeType?: string;
  lastModifiedDateTime?: string;
}

const RESOURCE = new RegExp(
  `companies\\((${GUID})\\)/(salesInvoices|purchaseInvoices|customers)(?:\\((${GUID})\\))?`,
  'i'
);
const CHANGE: Record<string, LiveChange> = {
  created: 'create',
  updated: 'update',
  deleted: 'delete',
  collection: 'collection',
};

/** Parse BC's resource path into company, entity and record id. */
export function parseBcResource(
  resource: string | undefined
): { companyId: string; resource: BcLiveResource; id?: string } | undefined {
  const match = resource ? RESOURCE.exec(resource) : null;
  if (!match) return undefined;
  const name = BC_LIVE_RESOURCES.find((r) => r.toLowerCase() === match[2].toLowerCase());
  if (!name) return undefined;
  return { companyId: match[1].toLowerCase(), resource: name, id: match[3]?.toLowerCase() };
}

export function parseBcNotifications(
  body: { value?: BcNotification[] },
  secret: string | undefined,
  receivedAt = new Date()
): LiveEvent[] {
  const events: LiveEvent[] = [];
  for (const n of body.value ?? []) {
    const owner = verifyClientState(n.clientState, secret);
    const target = parseBcResource(n.resource);
    const event = CHANGE[n.changeType ?? ''];
    if (!owner || !target || !event) continue;
    if (event !== 'collection' && !target.id) continue;
    const at =
      n.lastModifiedDateTime && !Number.isNaN(Date.parse(n.lastModifiedDateTime))
        ? new Date(n.lastModifiedDateTime).toISOString()
        : receivedAt.toISOString();
    events.push({
      key: bcSourceKey(owner.tenantId, owner.environment, target.companyId),
      entity: target.resource === 'customers' ? 'contact' : 'invoice',
      invoiceType:
        target.resource === 'salesInvoices'
          ? 'sales'
          : target.resource === 'purchaseInvoices'
            ? 'purchase'
            : undefined,
      // Bookie's BC contact ids are `c:{customerId}` (connectors/bc parseContactId).
      id:
        event === 'collection' || !target.id
          ? undefined
          : target.resource === 'customers'
            ? `c:${target.id}`
            : target.id,
      event,
      at,
    });
  }
  return events;
}

export const MAX_BC_BODY = 1_000_000;

/**
 * The whole BC endpoint as Request → Response. Handles the validation
 * handshake (GET or POST with `validationToken`) and notifications.
 *
 * BC deletes a subscription when the endpoint answers anything other than
 * 2xx, 408, 429 or 5xx, so notifications Bookie can't attribute are still
 * acknowledged (202) and simply dropped.
 */
export async function handleBcWebhook(
  request: Request,
  secret: string | undefined,
  dispatch: (event: LiveEvent) => void = publish
): Promise<Response> {
  const token = new URL(request.url).searchParams.get('validationToken');
  if (token !== null) {
    if (!secret) return new Response('Live updates are not configured.', { status: 503 });
    if (token.length > 1024) return new Response(null, { status: 400 });
    return new Response(token, {
      status: 200,
      // Plain text, never sniffed as HTML: the token is echoed verbatim.
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
    });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BC_BODY) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BC_BODY) return new Response(null, { status: 413 });
  let body: { value?: BcNotification[] };
  try {
    body = JSON.parse(raw.replace(/^﻿/, '')) as { value?: BcNotification[] };
  } catch {
    return new Response(null, { status: 202 });
  }
  for (const event of parseBcNotifications(body, secret)) dispatch(event);
  return new Response(null, { status: 202 });
}
