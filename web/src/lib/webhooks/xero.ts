import { createHmac, timingSafeEqual } from 'node:crypto';
import { publish, xeroSourceKey, type LiveChange, type LiveEvent } from './events';

/**
 * Xero webhooks (developer.xero.com/documentation/guides/webhooks).
 *
 * Xero signs every delivery: `x-xero-signature` is the base64 HMAC-SHA256 of
 * the raw request body, keyed with the app's webhook key. The first delivery
 * is the "Intent to receive" check: Xero sends correctly and incorrectly
 * signed payloads with no events, and expects 200 (empty body) for a good
 * signature and 401 for a bad one, within five seconds.
 */

export interface XeroWebhookEvent {
  resourceUrl?: string;
  resourceId?: string;
  eventDateUtc?: string;
  eventType?: string;
  eventCategory?: string;
  tenantId?: string;
  tenantType?: string;
}

export interface XeroWebhookPayload {
  events?: XeroWebhookEvent[];
  firstEventSequence?: number;
  lastEventSequence?: number;
  entropy?: string;
}

/** Bodies above this are refused before hashing. Xero batches are a few KB. */
export const MAX_WEBHOOK_BODY = 1_000_000;

export function xeroSignature(rawBody: string, webhookKey: string): string {
  return createHmac('sha256', webhookKey).update(rawBody, 'utf8').digest('base64');
}

/** Constant-time check of `x-xero-signature`. */
export function verifyXeroSignature(
  rawBody: string,
  signature: string | null | undefined,
  webhookKey: string | undefined
): boolean {
  if (!signature || !webhookKey) return false;
  const expected = Buffer.from(xeroSignature(rawBody, webhookKey));
  const given = Buffer.from(signature.trim());
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const CATEGORY: Record<string, LiveEvent['entity']> = { INVOICE: 'invoice', CONTACT: 'contact' };
const TYPE: Record<string, LiveChange> = { CREATE: 'create', UPDATE: 'update' };
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Invoice and contact create/update events, reduced to ids. Anything else is dropped. */
export function parseXeroEvents(payload: XeroWebhookPayload, receivedAt = new Date()): LiveEvent[] {
  const events: LiveEvent[] = [];
  for (const e of payload.events ?? []) {
    const entity = CATEGORY[e.eventCategory ?? ''];
    const event = TYPE[e.eventType ?? ''];
    if (!entity || !event || !e.tenantId || !GUID.test(e.tenantId)) continue;
    if (!e.resourceId || !GUID.test(e.resourceId)) continue;
    const at = e.eventDateUtc && !Number.isNaN(Date.parse(e.eventDateUtc)) ? e.eventDateUtc : '';
    events.push({
      key: xeroSourceKey(e.tenantId),
      entity,
      id: e.resourceId.toLowerCase(),
      event,
      // Xero sends eventDateUtc without a zone designator; it is UTC.
      at: at
        ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(at) ? at : `${at}Z`).toISOString()
        : receivedAt.toISOString(),
    });
  }
  return events;
}

/**
 * The whole endpoint, as a plain Request → Response function so it can be
 * tested without Next.js. Verifies first, parses second, never echoes input.
 */
export async function handleXeroWebhook(
  request: Request,
  webhookKey: string | undefined,
  dispatch: (event: LiveEvent) => void = publish
): Promise<Response> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_WEBHOOK_BODY) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_WEBHOOK_BODY) return new Response(null, { status: 413 });
  if (!verifyXeroSignature(raw, request.headers.get('x-xero-signature'), webhookKey)) {
    return new Response(null, { status: 401 });
  }
  let payload: XeroWebhookPayload;
  try {
    payload = JSON.parse(raw) as XeroWebhookPayload;
  } catch {
    // Correctly signed but not JSON: acknowledge so Xero doesn't retry forever.
    return new Response(null, { status: 200 });
  }
  for (const event of parseXeroEvents(payload)) dispatch(event);
  return new Response(null, { status: 200 });
}
