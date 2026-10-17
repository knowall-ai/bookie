import type { HistoryEntity, HistoryResult } from '@/lib/domain/types';
import type { HistoryModule } from '../../types';
import { ConnectorError } from '../../types';
import type { BcClient } from '../client';
import { parseContactId } from '../index';

export const BC_HISTORY_NOTE = "Full history isn't available from Business Central.";

/** Entity sets to try for each history entity; ids are unique GUIDs across them. */
const SETS: Record<Exclude<HistoryEntity, 'contact'>, string[]> = {
  invoice: ['salesInvoices', 'purchaseInvoices'],
  quote: ['salesQuotes'],
  'credit-note': ['salesCreditMemos', 'purchaseCreditMemos'],
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** BC API v2.0 has no change log: all it exposes is each record's lastModifiedDateTime. */
export function bcHistoryResult(lastModified: string | undefined): HistoryResult {
  return {
    records: lastModified ? [{ date: lastModified, change: 'Last modified' }] : [],
    complete: false,
    note: BC_HISTORY_NOTE,
  };
}

/** Business Central: last-modified only, and no notes (the API has no record links). */
export function bcHistory(client: BcClient): HistoryModule {
  const lastModified = async (path: string) =>
    (
      await client.request<{ lastModifiedDateTime?: string }>(path, {
        query: { $select: 'id,lastModifiedDateTime' },
      })
    ).lastModifiedDateTime;

  return {
    async list(entity, id) {
      if (entity === 'contact') {
        const { entity: set, id: raw } = parseContactId(id);
        return bcHistoryResult(await lastModified(`${set}(${raw})`));
      }
      if (!GUID.test(id)) throw new ConnectorError('Unknown id.', 400, 'business-central');
      for (const set of SETS[entity]) {
        try {
          return bcHistoryResult(await lastModified(`${set}(${id})`));
        } catch (error) {
          if (!(error instanceof ConnectorError) || error.status !== 404) throw error;
        }
      }
      throw new ConnectorError('Not found.', 404, 'business-central');
    },
  };
}
