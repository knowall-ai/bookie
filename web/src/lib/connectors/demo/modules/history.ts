/**
 * Demo "History and notes". Fictional: each record starts with the events its
 * fixture implies (created, approved), and writes made through the demo
 * connector (notes, credit allocations, mark as sent) are appended.
 */
import type { HistoryEntity, HistoryRecord } from '@/lib/domain/types';
import { ConnectorError, type HistoryModule } from '../../types';
import type { DemoData } from '../data';
import { formatMoney } from '@/lib/ui/format';
import { demoSlot } from './state';
import { quotesOf } from './quotes';
import { creditNotesOf } from './credit-notes';

export const DEMO_USER = 'Alex Morgan';

type Log = Map<string, HistoryRecord[]>;

const key = (entity: HistoryEntity, id: string) => `${entity}:${id}`;

/**
 * The log is snapshotted from the fixtures the first time it is touched (the demo
 * connector touches it when it is built, before anything changes), so later writes
 * append to the fixture's story instead of rewriting it.
 */
export function demoHistoryLog(data: DemoData): Log {
  return demoSlot<Log>(data, 'history', () => {
    const log: Log = new Map();
    const add = (entity: HistoryEntity, id: string) => {
      const records = seeded(data, entity, id);
      if (records) log.set(key(entity, id), records);
    };
    for (const i of data.invoices) add('invoice', i.id);
    for (const q of quotesOf(data)) add('quote', q.id);
    for (const c of creditNotesOf(data)) add('credit-note', c.id);
    for (const c of data.contacts) add('contact', c.id);
    return log;
  });
}

/** Records made after the snapshot (e.g. a new invoice) start from their current state. */
function entryOf(data: DemoData, entity: HistoryEntity, id: string) {
  const log = demoHistoryLog(data);
  const k = key(entity, id);
  let entry = log.get(k);
  if (!entry) {
    const records = seeded(data, entity, id);
    if (!records) return undefined;
    entry = records;
    log.set(k, entry);
  }
  return entry;
}

/** Append an event to a demo record's history. */
export function demoRecord(
  data: DemoData,
  entity: HistoryEntity,
  id: string,
  change: string,
  details?: string
) {
  const entry = entryOf(data, entity, id);
  const record = { date: new Date().toISOString(), change, user: DEMO_USER, details };
  if (entry) entry.push(record);
  else demoHistoryLog(data).set(key(entity, id), [record]);
}

const at = (date: string, time: string) => `${date}T${time}.000Z`;

/** The events a fixture implies, oldest first. */
function seeded(data: DemoData, entity: HistoryEntity, id: string): HistoryRecord[] | undefined {
  const user = DEMO_USER;
  if (entity === 'invoice') {
    const inv = data.invoices.find((i) => i.id === id);
    if (!inv) return undefined;
    const summary = `${inv.number} to ${inv.contact.name} for ${formatMoney(inv.total, inv.currency)}.`;
    const records: HistoryRecord[] = [
      { date: at(inv.date, '09:12:00'), change: 'Created', user, details: summary },
    ];
    if (!['draft', 'submitted', 'deleted'].includes(inv.status))
      records.push({ date: at(inv.date, '09:14:00'), change: 'Approved', user, details: summary });
    for (const p of inv.payments ?? [])
      records.push({
        date: at(p.date, '10:00:00'),
        change: 'Paid',
        user,
        details: `Payment received from ${inv.contact.name} on ${p.date} for ${formatMoney(p.amount, inv.currency)}.`,
      });
    return records;
  }
  if (entity === 'quote') {
    const q = quotesOf(data).find((x) => x.id === id);
    if (!q) return undefined;
    const summary = `${q.number} to ${q.contact.name} for ${formatMoney(q.total, q.currency)}.`;
    const records: HistoryRecord[] = [
      { date: at(q.date, '11:02:00'), change: 'Created', user, details: summary },
    ];
    if (q.status !== 'draft')
      records.push({ date: at(q.date, '11:05:00'), change: 'Sent', user, details: summary });
    return records;
  }
  if (entity === 'credit-note') {
    const c = creditNotesOf(data).find((x) => x.id === id);
    if (!c) return undefined;
    const summary = `${c.number} to ${c.contact.name} for ${formatMoney(c.total, c.currency)}.`;
    const records: HistoryRecord[] = [
      { date: at(c.date, '14:20:00'), change: 'Created', user, details: summary },
    ];
    if (c.status !== 'draft')
      records.push({ date: at(c.date, '14:21:00'), change: 'Approved', user, details: summary });
    return records;
  }
  const contact = data.contacts.find((c) => c.id === id);
  if (!contact) return undefined;
  return [
    {
      date: '2025-04-01T08:30:00.000Z',
      change: 'Created',
      user,
      details: `Contact ${contact.name} created.`,
    },
  ];
}

export function demoHistory(data: DemoData): HistoryModule {
  demoHistoryLog(data);
  return {
    async list(entity, id) {
      const entry = entryOf(data, entity, id);
      if (!entry) throw new ConnectorError('Not found.', 404, 'demo');
      // Newest first; events logged in the same millisecond keep their order, reversed.
      const records = entry
        .map((r, i) => ({ r, i }))
        .sort((a, b) => b.r.date.localeCompare(a.r.date) || b.i - a.i)
        .map(({ r }) => r);
      return { records: structuredClone(records), complete: true };
    },
    async addNote(entity, id, note) {
      if (!entryOf(data, entity, id)) throw new ConnectorError('Not found.', 404, 'demo');
      demoRecord(data, entity, id, 'Note', note);
    },
  };
}
