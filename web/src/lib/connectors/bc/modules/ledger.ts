import type { IsoDate } from '@/lib/domain/types';
import type { LedgerJournal } from '@/lib/reports/ledger';
import { odataString, type BcClient, type ODataList } from '../client';
import { ConnectorError } from '../../types';
import { decodeBcEnum, type BcGlEntry } from './accounts';

/** Most G/L entries one report reads; more than this and Bookie asks for a shorter period. */
export const MAX_GL_ENTRIES = 5000;

/** Business Central's document types, as its General Ledger Entries page names them. */
function documentTypeLabel(type: string | undefined): string | undefined {
  const label = decodeBcEnum(type).trim();
  return label || undefined;
}

/**
 * G/L entries grouped into one journal per document number and posting date,
 * which is how Business Central's G/L Register shows a posted transaction.
 */
export function fromBcGlEntriesToLedger(
  entries: BcGlEntry[],
  accountNames: Map<string, string>
): LedgerJournal[] {
  const groups = new Map<string, BcGlEntry[]>();
  for (const entry of entries) {
    const key = `${entry.documentNumber ?? ''}~${entry.postingDate.slice(0, 10)}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()].map(([key, group]) => {
    group.sort((a, b) => a.entryNumber - b.entryNumber);
    const first = group[0];
    return {
      id: key,
      number: first.documentNumber || undefined,
      date: first.postingDate.slice(0, 10),
      source: documentTypeLabel(first.documentType),
      lines: group.map((e) => ({
        accountCode: e.accountNumber,
        accountName: accountNames.get(e.accountNumber),
        description: e.description || undefined,
        amount: Math.round(((e.debitAmount ?? 0) - (e.creditAmount ?? 0)) * 100) / 100,
      })),
    };
  });
}

/** Posted G/L entries in a period (optionally one account), oldest first. */
export async function bcLedgerJournals(
  client: BcClient,
  from: IsoDate,
  to: IsoDate,
  accountCode?: string
): Promise<LedgerJournal[]> {
  const filters = [`postingDate ge ${from}`, `postingDate le ${to}`];
  if (accountCode) filters.push(`accountNumber eq ${odataString(accountCode)}`);
  const [entries, accounts] = await Promise.all([
    client.request<ODataList<BcGlEntry>>('generalLedgerEntries', {
      query: {
        $filter: filters.join(' and '),
        $orderby: 'entryNumber',
        $top: MAX_GL_ENTRIES + 1,
      },
    }),
    client.all<{ number: string; displayName?: string }>('accounts', {
      $select: 'number,displayName',
    }),
  ]);
  if (entries.value.length > MAX_GL_ENTRIES) {
    throw new ConnectorError(
      `This period has more than ${MAX_GL_ENTRIES.toLocaleString('en-GB')} ledger entries. Choose a shorter period or one account.`,
      400,
      'business-central'
    );
  }
  const names = new Map(accounts.map((a) => [a.number, a.displayName ?? '']));
  return fromBcGlEntriesToLedger(entries.value, names);
}
