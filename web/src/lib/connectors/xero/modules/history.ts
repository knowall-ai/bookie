import type { HistoryEntity, HistoryRecord } from '@/lib/domain/types';
import type { HistoryModule } from '../../types';
import { xeroTimestamp, type XeroClient } from '../client';

export interface XeroHistoryRecord {
  Changes?: string;
  DateUTC?: string;
  DateUTCString?: string;
  User?: string;
  Details?: string;
}

/** Xero endpoint behind each history entity (`{Endpoint}/{id}/History`). */
const ENDPOINT: Record<HistoryEntity, string> = {
  invoice: 'Invoices',
  quote: 'Quotes',
  'credit-note': 'CreditNotes',
  contact: 'Contacts',
};

export function fromXeroHistoryRecord(raw: XeroHistoryRecord): HistoryRecord | undefined {
  // DateUTC is `/Date(ms+0000)/`; DateUTCString is UTC without a zone marker.
  const date =
    xeroTimestamp(raw.DateUTC) ?? (raw.DateUTCString ? `${raw.DateUTCString}Z` : undefined);
  if (!date) return undefined;
  return {
    date,
    change: raw.Changes || 'Change',
    user: raw.User || undefined,
    details: raw.Details || undefined,
  };
}

export function xeroHistory(client: XeroClient): HistoryModule {
  const path = (entity: HistoryEntity, id: string) =>
    `${ENDPOINT[entity]}/${encodeURIComponent(id)}/History`;
  return {
    async list(entity, id) {
      const result = await client.request<{ HistoryRecords?: XeroHistoryRecord[] }>(
        path(entity, id)
      );
      const records = (result.HistoryRecords ?? [])
        .map(fromXeroHistoryRecord)
        .filter((r): r is HistoryRecord => !!r)
        .sort((a, b) => b.date.localeCompare(a.date));
      return { records, complete: true };
    },
    async addNote(entity, id, note) {
      await client.request(path(entity, id), {
        method: 'PUT',
        body: { HistoryRecords: [{ Details: note }] },
      });
    },
  };
}
