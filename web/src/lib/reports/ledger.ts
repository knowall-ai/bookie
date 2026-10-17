/**
 * Account Transactions and the Journal Report, built from posted journal lines.
 *
 * Every connector maps its own ledger (Xero Journals, Business Central G/L
 * entries, the demo books) into `LedgerJournal`s and these builders lay them
 * out the way Xero's reports do. Amounts are net, debit positive.
 */
import type { IsoDate, Report, ReportRow, ReportSection } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';

export interface LedgerLine {
  accountCode: string;
  accountName?: string;
  description?: string;
  /** Net amount: positive = debit, negative = credit. */
  amount: number;
}

export interface LedgerJournal {
  id: string;
  /** Journal or document number, as the source shows it. */
  number?: string;
  date: IsoDate;
  /** Human label for what created it, e.g. "Spend money", "Manual journal". */
  source?: string;
  reference?: string;
  lines: LedgerLine[];
}

const round = (n: number) => Math.round(n * 100) / 100;

const debit = (amount: number) => (amount > 0 ? round(amount) : null);
const credit = (amount: number) => (amount < 0 ? round(-amount) : null);

const byDate = (a: LedgerJournal, b: LedgerJournal) =>
  a.date.localeCompare(b.date) ||
  (a.number ?? '').localeCompare(b.number ?? '', 'en', { numeric: true });

const accountLabel = (code: string, name?: string) => (name ? `${code} - ${name}` : code);

export interface LedgerReportOptions {
  orgName: string;
  from: IsoDate;
  to: IsoDate;
  journals: LedgerJournal[];
  /** Extra lines under the title, e.g. how the source data was gathered. */
  notes?: string[];
}

/**
 * Xero's Account Transactions report: one section per account, oldest first,
 * Date / Source / Description / Reference / Debit / Credit, with a total and
 * the net movement per account. No running balance (the opening balance isn't
 * part of the journals).
 */
export function buildAccountTransactions(
  options: LedgerReportOptions & { accountCode?: string }
): Report {
  const { orgName, from, to, accountCode, notes = [] } = options;
  const inRange = options.journals.filter((j) => j.date >= from && j.date <= to).sort(byDate);
  const accounts = new Map<string, { name?: string; rows: ReportRow[]; dr: number; cr: number }>();
  for (const journal of inRange) {
    for (const line of journal.lines) {
      if (accountCode && line.accountCode !== accountCode) continue;
      if (round(line.amount) === 0) continue;
      const account = accounts.get(line.accountCode) ?? { rows: [], dr: 0, cr: 0 };
      account.name ??= line.accountName;
      account.rows.push({
        kind: 'row',
        cells: [
          formatDate(journal.date),
          journal.source ?? '',
          line.description ?? '',
          journal.reference ?? journal.number ?? '',
          debit(line.amount),
          credit(line.amount),
        ],
      });
      if (line.amount > 0) account.dr += line.amount;
      else account.cr -= line.amount;
      accounts.set(line.accountCode, account);
    }
  }
  const sections: ReportSection[] = [...accounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([code, account]) => {
      const name = accountLabel(code, account.name);
      return {
        title: name,
        rows: [
          ...account.rows,
          {
            kind: 'summary',
            cells: [`Total ${name}`, null, null, null, round(account.dr), round(account.cr)],
          },
          {
            kind: 'summary',
            cells: ['Net movement', null, null, null, round(account.dr - account.cr), null],
          },
        ],
      };
    });
  return {
    id: 'account-transactions',
    title: 'Account Transactions',
    subtitles: [orgName, `${formatDate(from)} to ${formatDate(to)}`, ...notes],
    columns: ['Date', 'Source', 'Description', 'Reference', 'Debit', 'Credit'],
    textColumns: [1, 2, 3],
    sections,
    generatedAt: new Date().toISOString(),
  };
}

/** Xero's Journal Report: every posted journal in the period with its lines and totals. */
export function buildJournalReport(options: LedgerReportOptions): Report {
  const { orgName, from, to, notes = [] } = options;
  const inRange = options.journals.filter((j) => j.date >= from && j.date <= to).sort(byDate);
  const sections: ReportSection[] = inRange.map((journal) => {
    const lines = journal.lines.filter((l) => round(l.amount) !== 0);
    const dr = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);
    const cr = lines.reduce((s, l) => s + (l.amount < 0 ? -l.amount : 0), 0);
    const title = [
      formatDate(journal.date),
      journal.number ? `Journal ${journal.number}` : undefined,
      journal.source,
      journal.reference,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      title,
      rows: [
        ...lines.map((l): ReportRow => ({
          kind: 'row',
          cells: [
            accountLabel(l.accountCode, l.accountName),
            l.description ?? '',
            debit(l.amount),
            credit(l.amount),
          ],
        })),
        { kind: 'summary', cells: ['Total', null, round(dr), round(cr)] },
      ],
    };
  });
  return {
    id: 'journal-report',
    title: 'Journal Report',
    subtitles: [orgName, `${formatDate(from)} to ${formatDate(to)}`, ...notes],
    columns: ['Account', 'Description', 'Debit', 'Credit'],
    textColumns: [1],
    sections,
    generatedAt: new Date().toISOString(),
  };
}
