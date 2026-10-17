import type { ManualJournal, ManualJournalInput } from '@/lib/domain/types';
import { ConnectorError } from '../../types';
import { odataString, type BcClient } from '../client';
import type { JournalsModule } from '../../types';

/* Raw shapes (BC API v2.0 `journals` = general journal batches, `journalLines` = their lines). */

export interface BcJournal {
  id: string;
  code: string;
  displayName?: string;
}

export interface BcJournalLine {
  id: string;
  journalId: string;
  journalDisplayName?: string;
  lineNumber: number;
  accountType?: string;
  accountNumber?: string;
  postingDate: string;
  documentNumber?: string;
  amount: number;
  description?: string;
  comment?: string;
  taxCode?: string;
}

interface BcGlEntry {
  id: string;
  postingDate: string;
  documentNumber?: string;
  accountNumber: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
}

export const BC_POSTED_JOURNALS_NOTE =
  "Business Central's API doesn't mark which ledger entries came from a general journal, so posted journals can't be listed here. Journals you post from Bookie open from the link it gives you; see General Ledger Entries in Business Central for the rest.";

/**
 * Ids: a draft is one document inside a journal batch (`d~{batchId}~{documentNumber}`);
 * a posted journal is a set of G/L entries (`p~{documentNumber}~{postingDate}`).
 */
export function draftId(journalId: string, documentNumber: string) {
  return `d~${journalId}~${documentNumber}`;
}
export function postedId(documentNumber: string, date: string) {
  return `p~${documentNumber}~${date}`;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Group a batch's lines into one draft manual journal per document number. */
export function groupJournalLines(lines: BcJournalLine[]): ManualJournal[] {
  const groups = new Map<string, BcJournalLine[]>();
  for (const line of lines) {
    const key = draftId(line.journalId, line.documentNumber ?? '');
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups.entries()].map(([id, group]) => {
    group.sort((a, b) => a.lineNumber - b.lineNumber);
    const first = group[0];
    return {
      id,
      date: first.postingDate.slice(0, 10),
      narration:
        first.comment ||
        first.description ||
        `${first.journalDisplayName ?? 'Journal'} ${first.documentNumber ?? ''}`.trim(),
      status: 'draft',
      lines: group.map((l) => ({
        accountCode: l.accountNumber ?? '',
        description: l.description || undefined,
        amount: l.amount,
        taxType: l.taxCode || undefined,
      })),
      total: round(group.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0)),
    } satisfies ManualJournal;
  });
}

export function fromBcGlEntries(id: string, entries: BcGlEntry[]): ManualJournal {
  const lines = entries.map((e) => ({
    accountCode: e.accountNumber,
    description: e.description || undefined,
    amount: round((e.debitAmount ?? 0) - (e.creditAmount ?? 0)),
  }));
  return {
    id,
    date: entries[0]?.postingDate.slice(0, 10) ?? '',
    narration: entries[0]?.description || entries[0]?.documentNumber || '',
    status: 'posted',
    lines,
    total: round(lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0)),
  };
}

export function toBcJournalLines(input: ManualJournalInput, documentNumber: string) {
  return input.lines.map((l) => ({
    accountType: 'G/L Account',
    accountNumber: l.accountCode,
    postingDate: input.date,
    documentNumber,
    amount: l.amount,
    description: (l.description || input.narration).slice(0, 100),
    comment: input.narration.slice(0, 250),
  }));
}

/** A fresh batch code per write (max 10 chars), so posting never sweeps up anyone else's lines. */
export function journalBatchCode(now = Date.now()): string {
  return `BK${now.toString(36).toUpperCase().slice(-8)}`;
}

/** Post a Bookie-created batch, then delete the now-empty batch so BC isn't littered with them. */
export async function postAndRemoveBatch(client: BcClient, batchId: string) {
  const remove = () =>
    client.request(`journals(${batchId})`, { method: 'DELETE', etag: '*' }).catch(() => {});
  try {
    await client.request(`journals(${batchId})/Microsoft.NAV.post`, { method: 'POST' });
  } catch (error) {
    // BC refused to post (e.g. posting-group rules): don't leave half-entered lines behind.
    await remove();
    throw error;
  }
  await remove();
}

export function bcJournals(client: BcClient): JournalsModule {
  const drafts = async () => {
    // BC only returns journal lines per batch, so read each general journal batch.
    const batches = await client.all<BcJournal>('journals', { $select: 'id,code,displayName' });
    const lines = (
      await Promise.all(
        batches.map((b) => client.all<BcJournalLine>(`journals(${b.id})/journalLines`))
      )
    ).flat();
    return groupJournalLines(lines).sort(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)
    );
  };

  const posted = async (documentNumber: string, date: string) => {
    const entries = await client.all<BcGlEntry>('generalLedgerEntries', {
      $filter: `documentNumber eq ${odataString(documentNumber)} and postingDate eq ${date}`,
      $orderby: 'entryNumber',
    });
    if (entries.length === 0)
      throw new ConnectorError('Journal not found.', 404, 'business-central');
    return fromBcGlEntries(postedId(documentNumber, date), entries);
  };

  return {
    async list(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      if (query?.status === 'posted') {
        return {
          items: [],
          page,
          pageSize,
          hasMore: false,
          total: 0,
          note: BC_POSTED_JOURNALS_NOTE,
        };
      }
      const needle = query?.search?.toLowerCase();
      const all = (await drafts()).filter(
        (j) =>
          (!query?.from || j.date >= query.from) &&
          (!query?.to || j.date <= query.to) &&
          (!needle || j.narration.toLowerCase().includes(needle))
      );
      return {
        items: all.slice((page - 1) * pageSize, page * pageSize),
        page,
        pageSize,
        hasMore: all.length > page * pageSize,
        total: all.length,
        note: query?.status === 'draft' ? undefined : BC_POSTED_JOURNALS_NOTE,
      };
    },

    async get(id) {
      const [kind, a, b] = id.split('~');
      if (kind === 'p' && a && b) return posted(a, b);
      if (kind === 'd' && a) {
        const lines = await client.all<BcJournalLine>(`journals(${a})/journalLines`, {
          $filter: `documentNumber eq ${odataString(b ?? '')}`,
        });
        const [journal] = groupJournalLines(lines);
        if (journal) return journal;
      }
      throw new ConnectorError('Journal not found.', 404, 'business-central');
    },

    async create(input) {
      const total = round(input.lines.reduce((s, l) => s + l.amount, 0));
      if (total !== 0) {
        throw new ConnectorError('Debits and credits must balance.', 400, 'business-central');
      }
      const code = journalBatchCode();
      const documentNumber = `BOOKIE-${code.slice(2)}`;
      const batch = await client.request<BcJournal>('journals', {
        method: 'POST',
        body: { code, displayName: input.narration.slice(0, 50) || 'Bookie journal' },
      });
      for (const line of toBcJournalLines(input, documentNumber)) {
        await client.request(`journals(${batch.id})/journalLines`, { method: 'POST', body: line });
      }
      if (input.status === 'posted') {
        await postAndRemoveBatch(client, batch.id);
        return posted(documentNumber, input.date);
      }
      const lines = await client.all<BcJournalLine>(`journals(${batch.id})/journalLines`);
      return groupJournalLines(lines)[0];
    },
  };
}
