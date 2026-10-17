import type { LedgerEntry } from '@/lib/domain/types';
import type { LedgerJournal } from '@/lib/reports/ledger';
import { XERO_SOURCE_TYPES } from '../../xero/modules/ledger';

/** The demo ledger posts all bank activity as `CASH`; the rest use Xero's own codes. */
function sourceLabel(code: string): string {
  return code === 'CASH' ? 'Bank Transaction' : (XERO_SOURCE_TYPES[code] ?? code);
}

/**
 * The demo general ledger grouped into journals (one per document and date),
 * labelled the way Xero labels its journal sources.
 */
export function demoLedgerJournals(
  entries: LedgerEntry[],
  accountNames: Map<string, string>
): LedgerJournal[] {
  const groups = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const key = `${entry.documentNumber ?? entry.id}~${entry.date}~${entry.sourceType ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  let number = 0;
  return [...groups.entries()]
    .sort(([, a], [, b]) => a[0].date.localeCompare(b[0].date))
    .map(([key, group]) => {
      const first = group[0];
      return {
        id: key,
        number: String(++number),
        date: first.date,
        source: first.sourceType ? sourceLabel(first.sourceType) : undefined,
        reference: first.documentNumber,
        lines: group.map((e) => ({
          accountCode: e.accountCode,
          accountName: e.accountName ?? accountNames.get(e.accountCode),
          description: e.description,
          amount: Math.round((e.debit - e.credit) * 100) / 100,
        })),
      };
    });
}
