import type { JournalStatusChange, ManualJournal, ManualJournalInput } from '@/lib/domain/types';
import { xeroDate, xeroTimestamp, type XeroClient } from '../client';
import { fromLineAmountTypes } from '../mappers';
import { ConnectorError, type JournalsModule } from '../../types';

export interface XeroManualJournal {
  ManualJournalID: string;
  Date?: string;
  Narration?: string;
  Status: 'DRAFT' | 'POSTED' | 'DELETED' | 'VOIDED' | 'ARCHIVED';
  LineAmountTypes?: string;
  DebitTotal?: number;
  ShowOnCashBasisReports?: boolean;
  HasAttachments?: boolean;
  UpdatedDateUTC?: string;
  JournalLines?: {
    AccountCode?: string;
    Description?: string;
    LineAmount?: number;
    TaxType?: string;
    Tracking?: unknown[];
  }[];
}

const STATUS: Record<XeroManualJournal['Status'], ManualJournal['status']> = {
  DRAFT: 'draft',
  POSTED: 'posted',
  VOIDED: 'voided',
  DELETED: 'deleted',
  ARCHIVED: 'voided',
};

const STATUS_FILTER: Record<string, string | undefined> = {
  draft: 'Status=="DRAFT"',
  posted: 'Status=="POSTED"',
  voided: 'Status=="VOIDED"',
  all: 'Status!="DELETED"',
};

const round = (n: number) => Math.round(n * 100) / 100;

export function fromXeroManualJournal(raw: XeroManualJournal): ManualJournal {
  const lines = (raw.JournalLines ?? []).map((l) => ({
    accountCode: l.AccountCode ?? '',
    description: l.Description || undefined,
    amount: l.LineAmount ?? 0,
    taxType: l.TaxType && l.TaxType !== 'NONE' ? l.TaxType : undefined,
  }));
  const debits = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
  return {
    id: raw.ManualJournalID,
    date: xeroDate(raw.Date) ?? '',
    narration: raw.Narration ?? '',
    status: STATUS[raw.Status] ?? 'draft',
    lines,
    total: raw.DebitTotal ?? round(debits),
    lineAmountType: fromLineAmountTypes(raw.LineAmountTypes),
    showOnCashBasisReports: raw.ShowOnCashBasisReports,
    hasAttachments: raw.HasAttachments,
    updatedAt: xeroTimestamp(raw.UpdatedDateUTC),
  };
}

const CHANGE: Record<JournalStatusChange, { status: string; from: XeroManualJournal['Status'] }> = {
  posted: { status: 'POSTED', from: 'DRAFT' },
  deleted: { status: 'DELETED', from: 'DRAFT' },
  voided: { status: 'VOIDED', from: 'POSTED' },
};

/**
 * The update body for a status change. Xero allows draft → posted or deleted
 * and posted → voided. The journal is re-sent as Xero has it (same lines,
 * tax treatment and tracking), so only the status changes. Exported for tests.
 */
export function toXeroJournalStatusUpdate(
  raw: XeroManualJournal,
  change: JournalStatusChange
): Record<string, unknown> {
  const rule = CHANGE[change];
  if (raw.Status !== rule.from) {
    throw new Error(`Only ${rule.from.toLowerCase()} journals can be ${change}.`);
  }
  return {
    ManualJournalID: raw.ManualJournalID,
    Narration: raw.Narration,
    Date: xeroDate(raw.Date),
    LineAmountTypes: raw.LineAmountTypes,
    ShowOnCashBasisReports: raw.ShowOnCashBasisReports,
    JournalLines: raw.JournalLines,
    Status: rule.status,
  };
}

/** LineAmount is positive for a debit and negative for a credit, which is Bookie's convention too. */
export function toXeroManualJournal(input: ManualJournalInput): Record<string, unknown> {
  const taxed = input.lines.some((l) => l.taxType);
  return {
    Narration: input.narration,
    Date: input.date,
    Status: input.status === 'posted' ? 'POSTED' : 'DRAFT',
    // With tax rates the entered amounts are gross, so the journal still balances as typed.
    LineAmountTypes: taxed ? 'Inclusive' : 'NoTax',
    JournalLines: input.lines.map((l) => ({
      AccountCode: l.accountCode,
      Description: l.description || undefined,
      LineAmount: l.amount,
      TaxType: l.taxType || undefined,
    })),
  };
}

export function xeroJournals(client: XeroClient): JournalsModule {
  const raw = async (id: string) => {
    const result = await client.request<{ ManualJournals: XeroManualJournal[] }>(
      `ManualJournals/${encodeURIComponent(id)}`
    );
    return result.ManualJournals[0];
  };
  return {
    async list(query) {
      const pageSize = query?.pageSize ?? 50;
      const page = query?.page ?? 1;
      const where = [STATUS_FILTER[query?.status ?? 'all'] ?? STATUS_FILTER.all];
      if (query?.from) where.push(`Date>=DateTime(${query.from.replaceAll('-', ',')})`);
      if (query?.to) where.push(`Date<=DateTime(${query.to.replaceAll('-', ',')})`);
      const result = await client.request<{
        ManualJournals: XeroManualJournal[];
        pagination?: { itemCount?: number };
      }>('ManualJournals', {
        query: { where: where.join(' AND '), order: 'Date DESC', page, pageSize },
      });
      let items = result.ManualJournals.map(fromXeroManualJournal);
      if (query?.search) {
        const needle = query.search.toLowerCase();
        items = items.filter((j) => j.narration.toLowerCase().includes(needle));
      }
      const total = result.pagination?.itemCount;
      return {
        items,
        page,
        pageSize,
        hasMore:
          total !== undefined ? total > page * pageSize : result.ManualJournals.length >= pageSize,
        total: query?.search ? undefined : total,
      };
    },
    get: async (id) => fromXeroManualJournal(await raw(id)),
    async setStatus(id, change) {
      const current = await raw(id);
      let body: Record<string, unknown>;
      try {
        body = toXeroJournalStatusUpdate(current, change);
      } catch (error) {
        throw new ConnectorError((error as Error).message, 400, 'xero');
      }
      const result = await client.request<{ ManualJournals: XeroManualJournal[] }>(
        `ManualJournals/${encodeURIComponent(id)}`,
        { method: 'POST', body: { ManualJournals: [body] } }
      );
      return fromXeroManualJournal(result.ManualJournals[0]);
    },
    statuses: ['draft', 'posted', 'voided'],
    async create(input) {
      const result = await client.request<{ ManualJournals: XeroManualJournal[] }>(
        'ManualJournals',
        { method: 'PUT', body: { ManualJournals: [toXeroManualJournal(input)] } }
      );
      return fromXeroManualJournal(result.ManualJournals[0]);
    },
  };
}
