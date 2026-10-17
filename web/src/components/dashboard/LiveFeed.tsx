'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, FileText, User } from 'lucide-react';
import { resolveLiveEvents, type ResolvedLiveEvent } from '@/lib/portal/actions/live';
import { StatusBadge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';

export interface FeedEvent {
  entity: 'invoice' | 'contact';
  invoiceType?: 'sales' | 'purchase';
  id?: string;
  event: 'create' | 'update' | 'delete' | 'collection';
  at: string;
}

const VERB = { create: 'created', update: 'updated', delete: 'deleted', collection: 'changed' };
const SHOWN = 8;

const relative = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

/** "just now", "2 minutes ago", "3 hours ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (Number.isNaN(seconds)) return '';
  if (seconds > -45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes > -60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

/** Newest event per record, newest first. */
export function latestPerRecord(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>();
  const out: FeedEvent[] = [];
  for (const e of [...events].sort((a, b) => b.at.localeCompare(a.at))) {
    const key = e.id ? `${e.entity}:${e.id}` : `${e.entity}:${e.invoiceType}:${e.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

function fallbackLabel(e: FeedEvent): string {
  if (e.event === 'collection') {
    return e.entity === 'contact'
      ? 'Several customers'
      : e.invoiceType === 'purchase'
        ? 'Several bills'
        : 'Several invoices';
  }
  if (e.entity === 'contact') return 'A contact';
  return e.invoiceType === 'purchase'
    ? 'A bill'
    : e.invoiceType === 'sales'
      ? 'An invoice'
      : 'An invoice or bill';
}

/**
 * Home › Live: what changed in the books in the last hour, pushed by Xero or
 * Business Central webhooks. Events carry ids only; each document's number
 * and status are fetched live when it appears here.
 */
export function LiveFeed({
  orgKey,
  sourceLabel,
  renewBc,
}: {
  orgKey: string;
  sourceLabel: string;
  /** Business Central: renew the tenant's webhook subscriptions while someone is looking. */
  renewBc?: boolean;
}) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [resolved, setResolved] = useState<Record<string, ResolvedLiveEvent>>({});
  const [connected, setConnected] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const asked = useRef(new Map<string, string>());

  useEffect(() => {
    if (renewBc) fetch('/api/webhooks/bc/renew', { method: 'POST' }).catch(() => undefined);
  }, [renewBc]);

  useEffect(() => {
    const source = new EventSource(`/api/orgs/${encodeURIComponent(orgKey)}/events`);
    source.addEventListener('snapshot', (e) => {
      setConnected(true);
      setEvents(JSON.parse((e as MessageEvent<string>).data) as FeedEvent[]);
    });
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as FeedEvent;
      setEvents((all) => [event, ...all].slice(0, 50));
    };
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [orgKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const shown = useMemo(() => latestPerRecord(events).slice(0, SHOWN), [events]);

  // Look up numbers and statuses for records we haven't asked about since their latest event.
  useEffect(() => {
    const pending = shown.filter((e) => e.id && asked.current.get(`${e.entity}:${e.id}`) !== e.at);
    if (pending.length === 0) return;
    for (const e of pending) asked.current.set(`${e.entity}:${e.id}`, e.at);
    resolveLiveEvents(
      orgKey,
      pending.map((e) => ({ entity: e.entity, id: e.id! }))
    ).then((result) => {
      if (!result.ok) return;
      setResolved((r) => {
        const next = { ...r };
        result.data.forEach((item, i) => (next[`${pending[i].entity}:${item.id}`] = item));
        return next;
      });
    });
  }, [shown, orgKey]);

  return (
    <Card aria-labelledby="live-heading" role="region" data-testid="live-feed">
      <CardHeader
        title={
          <span id="live-heading" className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              {connected && (
                <span className="bg-brand absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${connected ? 'bg-brand' : 'bg-surface-3'}`}
              />
            </span>
            Live
          </span>
        }
        subtitle={
          connected === false
            ? 'Reconnecting…'
            : `Changes in ${sourceLabel} as they happen, from the last hour`
        }
      />
      {shown.length === 0 ? (
        <div className="text-muted flex items-center gap-3 px-5 py-6 text-sm">
          <Activity className="text-faint h-5 w-5 shrink-0" aria-hidden />
          No activity yet. When an invoice, bill or contact changes in {sourceLabel}, it shows up
          here.
        </div>
      ) : (
        <ul className="divide-line divide-y" aria-live="polite">
          {shown.map((e) => {
            const info = e.id ? resolved[`${e.entity}:${e.id}`] : undefined;
            const Icon = e.entity === 'contact' ? User : FileText;
            const label = info?.label ?? fallbackLabel(e);
            const text = (
              <>
                <span className="text-ink font-medium">{label}</span>{' '}
                <span className="text-muted">{VERB[e.event]}</span>
              </>
            );
            return (
              <li
                key={`${e.entity}:${e.id ?? e.at}`}
                className="flex items-center gap-3 px-5 py-3 text-sm"
                data-testid="live-item"
              >
                <Icon className="text-faint h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {info?.href && !info.missing ? (
                    <Link href={info.href} className="hover:text-brand-bright">
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                </span>
                {info?.status && <StatusBadge status={info.status} overdue={info.overdue} />}
                <time dateTime={e.at} className="text-faint shrink-0 text-xs whitespace-nowrap">
                  {timeAgo(e.at, now)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
