import type { ManualJournal } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import { demoSlot } from './state';
import { ConnectorError, type JournalsModule } from '../../types';
import { demoId, matches, notFound, paginate } from '../index';

/** Fictional manual journals for the demo books, dated relative to today. */
function seedJournals(): ManualJournal[] {
  const today = DEMO_TODAY();
  const monthEnd = (monthsAgo: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - monthsAgo + 1, 0))
      .toISOString()
      .slice(0, 10);
  };
  const journal = (
    n: number,
    date: string,
    narration: string,
    status: ManualJournal['status'],
    lines: [string, string, number][]
  ): ManualJournal => ({
    id: `mj-${String(n).padStart(3, '0')}`,
    date,
    narration,
    status,
    lines: lines.map(([accountCode, description, amount]) => ({
      accountCode,
      description,
      amount,
    })),
    total: lines.reduce((s, [, , a]) => s + (a > 0 ? a : 0), 0),
    lineAmountType: 'none',
    showOnCashBasisReports: true,
    hasAttachments: n === 6,
  });
  return [
    journal(1, today, 'Accrue October electricity (Trey Energy bill not yet received)', 'draft', [
      ['445', 'Electricity accrual', 640],
      ['825', 'Electricity accrual', -640],
    ]),
    journal(2, addDays(today, -2), 'Reclassify roaster service to repairs', 'draft', [
      ['400', 'Reverse advertising coding', -180],
      ['445', 'Roaster service visit', 180],
    ]),
    journal(3, monthEnd(1), 'Monthly depreciation: roasting equipment', 'posted', [
      ['416', 'Depreciation for the month', 708.33],
      ['711', 'Accumulated depreciation', -708.33],
    ]),
    journal(4, monthEnd(1), 'Release prepaid insurance', 'posted', [
      ['400', 'Insurance for the month', 95],
      ['620', 'Prepayment release', -95],
    ]),
    journal(5, monthEnd(2), 'Monthly depreciation: roasting equipment', 'posted', [
      ['416', 'Depreciation for the month', 708.33],
      ['711', 'Accumulated depreciation', -708.33],
    ]),
    journal(6, monthEnd(2), 'Payroll journal: September salaries', 'posted', [
      ['477', 'Gross salaries', 8450],
      ['825', 'Net pay and PAYE due', -8450],
    ]),
    journal(7, monthEnd(3), 'Monthly depreciation: roasting equipment', 'posted', [
      ['416', 'Depreciation for the month', 708.33],
      ['711', 'Accumulated depreciation', -708.33],
    ]),
    journal(8, monthEnd(5), 'Owner funds introduced for new roaster', 'posted', [
      ['720', 'Drum roaster purchase', 42500],
      ['970', 'Funds introduced', -42500],
    ]),
    journal(9, monthEnd(7), 'Correct duplicate bank fee', 'voided', [
      ['404', 'Duplicate fee', -12.5],
      ['090', 'Duplicate fee', 12.5],
    ]),
  ];
}

function journals(data: DemoData): ManualJournal[] {
  return demoSlot(data, 'journals', seedJournals);
}

/** Posted journal lines, for the demo ledger and account balances. */
export function demoPostedJournalLines(data: DemoData) {
  return journals(data)
    .filter((j) => j.status === 'posted')
    .flatMap((j) =>
      j.lines.map((l) => ({ ...l, date: j.date, documentNumber: j.id.toUpperCase() }))
    );
}

export function demoJournals(data: DemoData): JournalsModule {
  return {
    async list(query) {
      const status = query?.status ?? 'all';
      const all = journals(data)
        .filter(
          (j) =>
            j.status !== 'deleted' &&
            (status === 'all' || j.status === status) &&
            (!query?.from || j.date >= query.from) &&
            (!query?.to || j.date <= query.to) &&
            matches([j.narration], query?.search)
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
      return paginate(structuredClone(all), query);
    },
    async get(id) {
      return structuredClone(journals(data).find((j) => j.id === id) ?? notFound('Journal'));
    },
    async create(input) {
      const total = Math.round(input.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
      if (total !== 0) throw new ConnectorError('Debits and credits must balance.', 400, 'demo');
      const accounts = new Map(data.accounts.map((a) => [a.code, a.name]));
      const journal: ManualJournal = {
        id: demoId('mj'),
        date: input.date,
        narration: input.narration,
        status: input.status ?? 'draft',
        lines: input.lines.map((l) => ({ ...l, accountName: accounts.get(l.accountCode) })),
        total: input.lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0),
      };
      journals(data).unshift(journal);
      return structuredClone(journal);
    },
    async setStatus(id, change) {
      const journal = journals(data).find((j) => j.id === id) ?? notFound('Journal');
      const from = change === 'voided' ? 'posted' : 'draft';
      if (journal.status !== from) {
        throw new ConnectorError(`Only ${from} journals can be ${change}.`, 400, 'demo');
      }
      journal.status = change;
      return structuredClone(journal);
    },
    statuses: ['draft', 'posted', 'voided'],
  };
}
