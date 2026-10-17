import type { OrgRef } from '@/lib/domain/types';

/**
 * Live activity: a tiny in-process event bus with a short-lived ring buffer.
 *
 * Webhook payloads from Xero and Business Central carry ids only, and that is
 * all Bookie keeps: {source key, entity, id, event, time}, in memory, for an
 * hour, at most 50 per organisation. Nothing is written anywhere. The Home
 * page's Live panel reads the buffer and fetches each document's number and
 * status live, on demand.
 *
 * Every event is filed under a *source key* that names the organisation in
 * its source system (never request input):
 *   xero:{xeroTenantId}
 *   bc:{entraTenantId}:{environment}:{companyId}
 *   demo:{orgKey}
 * Readers derive the key from an org the signed-in user can reach
 * (`sourceKeyForOrg`), so one tenant can never read another's activity.
 */

export type LiveEntity = 'invoice' | 'contact';
export type LiveChange = 'create' | 'update' | 'delete' | 'collection';

export interface LiveEvent {
  /** Source key (see above). */
  key: string;
  entity: LiveEntity;
  /** `sales` or `purchase` when the source says so (BC does, Xero doesn't). */
  invoiceType?: 'sales' | 'purchase';
  /** Source id of the record; absent for BC "collection" (many records) notifications. */
  id?: string;
  event: LiveChange;
  /** ISO timestamp of the change, per the source (or receipt time). */
  at: string;
}

export const BUFFER_SIZE = 50;
export const BUFFER_TTL_MS = 60 * 60_000;
/** Cap on organisations held, so a flood of keys can't grow memory without bound. */
export const MAX_KEYS = 5_000;

type Listener = (event: LiveEvent) => void;

interface BusState {
  buffers: Map<string, LiveEvent[]>;
  listeners: Map<string, Set<Listener>>;
}

/** One bus per process, even when Next.js evaluates this module more than once. */
function state(): BusState {
  const slot = Symbol.for('bookie.live-events');
  const g = globalThis as unknown as Record<symbol, BusState | undefined>;
  return (g[slot] ??= { buffers: new Map(), listeners: new Map() });
}

function fresh(events: LiveEvent[], now: number): LiveEvent[] {
  return events.filter((e) => now - Date.parse(e.at) < BUFFER_TTL_MS);
}

/** File an event and tell anyone listening on its key. */
export function publish(event: LiveEvent, now = Date.now()): void {
  const { buffers, listeners } = state();
  const existing = buffers.get(event.key);
  // Re-insert to keep Map order = least recently written first, for eviction.
  buffers.delete(event.key);
  const next = [event, ...fresh(existing ?? [], now)].slice(0, BUFFER_SIZE);
  buffers.set(event.key, next);
  while (buffers.size > MAX_KEYS) {
    const oldest = buffers.keys().next().value;
    if (oldest === undefined) break;
    buffers.delete(oldest);
  }
  for (const listener of listeners.get(event.key) ?? []) {
    try {
      listener(event);
    } catch {
      // A broken subscriber must not stop the others.
    }
  }
}

/** Recent events for one source key, newest first, optionally only those after `since`. */
export function recent(key: string, since?: string, now = Date.now()): LiveEvent[] {
  const events = fresh(state().buffers.get(key) ?? [], now);
  const after = since ? Date.parse(since) : NaN;
  return Number.isNaN(after) ? events : events.filter((e) => Date.parse(e.at) > after);
}

/** Listen for new events on one source key. Returns the unsubscribe function. */
export function subscribe(key: string, listener: Listener): () => void {
  const { listeners } = state();
  const set = listeners.get(key) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/** Test helper: forget everything. */
export function resetLiveEvents(): void {
  const s = state();
  s.buffers.clear();
  s.listeners.clear();
}

export function xeroSourceKey(xeroTenantId: string): string {
  return `xero:${xeroTenantId.toLowerCase()}`;
}

export function bcSourceKey(entraTenantId: string, environment: string, companyId: string): string {
  return `bc:${entraTenantId.toLowerCase()}:${environment}:${companyId.toLowerCase()}`;
}

export function demoSourceKey(orgKey: string): string {
  return `demo:${orgKey}`;
}

/**
 * The source key for an org the signed-in user can reach. `entraTenantId`
 * must come from the verified sign-in. Org keys are
 * `xero.{connectionId}.{xeroTenantId}`, `bc.{environment}.{companyId}` and
 * `demo.{slug}` (see connectors/registry.ts).
 */
export function sourceKeyForOrg(org: OrgRef, entraTenantId: string): string | undefined {
  const parts = org.key.split('.');
  if (org.kind === 'xero' && parts.length === 3) return xeroSourceKey(parts[2]);
  if (org.kind === 'business-central' && parts.length >= 3) {
    const companyId = parts[parts.length - 1];
    const environment = parts.slice(1, -1).join('.');
    return bcSourceKey(entraTenantId, environment, companyId);
  }
  if (org.kind === 'demo') return demoSourceKey(org.key);
  return undefined;
}
