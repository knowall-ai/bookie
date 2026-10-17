import type { Account, LedgerEntry } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import { demoSlot } from './state';
import { ConnectorError, type AccountsModule } from '../../types';
import { paginate } from '../index';
import { demoPostedJournalLines } from './journals';

/** Extra fictional accounts so the chart has fixed assets, accruals and an archived account. */
const EXTRA_ACCOUNTS: Account[] = [
  ['416', 'Depreciation', 'DEPRECIATN', 'Depreciation', 'expense'],
  ['404', 'Bank Fees', 'EXPENSE', 'Expense', 'expense'],
  ['620', 'Prepayments', 'CURRENT', 'Current Asset', 'asset'],
  ['710', 'Office Equipment', 'FIXED', 'Fixed Asset', 'asset'],
  ['711', 'Less Accumulated Depreciation on Equipment', 'FIXED', 'Fixed Asset', 'asset'],
  ['720', 'Roasting Equipment', 'FIXED', 'Fixed Asset', 'asset'],
  ['825', 'Accruals', 'CURRLIAB', 'Current Liability', 'liability'],
  ['960', 'Retained Earnings', 'EQUITY', 'Equity', 'equity'],
  ['499', 'Market Stall Fees', 'EXPENSE', 'Expense', 'expense'],
].map(([code, name, type, typeLabel, cls], i) => ({
  id: `acc-${code}`,
  code,
  name,
  type,
  typeLabel,
  class: cls as Account['class'],
  status: i === 8 ? ('archived' as const) : ('active' as const),
  isBank: false,
  taxType: cls === 'expense' && code !== '416' ? 'INPUT2' : undefined,
}));

const XERO_TYPES: Record<string, { label: string; class: Account['class'] }> = {
  BANK: { label: 'Bank', class: 'asset' },
  CURRENT: { label: 'Current Asset', class: 'asset' },
  FIXED: { label: 'Fixed Asset', class: 'asset' },
  INVENTORY: { label: 'Inventory', class: 'asset' },
  NONCURRENT: { label: 'Non-current Asset', class: 'asset' },
  PREPAYMENT: { label: 'Prepayment', class: 'asset' },
  CURRLIAB: { label: 'Current Liability', class: 'liability' },
  LIABILITY: { label: 'Liability', class: 'liability' },
  TERMLIAB: { label: 'Non-current Liability', class: 'liability' },
  EQUITY: { label: 'Equity', class: 'equity' },
  DEPRECIATN: { label: 'Depreciation', class: 'expense' },
  DIRECTCOSTS: { label: 'Direct Costs', class: 'expense' },
  EXPENSE: { label: 'Expense', class: 'expense' },
  OVERHEADS: { label: 'Overhead', class: 'expense' },
  OTHERINCOME: { label: 'Other Income', class: 'revenue' },
  REVENUE: { label: 'Revenue', class: 'revenue' },
  SALES: { label: 'Sales', class: 'revenue' },
};

function chart(data: DemoData): Account[] {
  demoSlot(data, 'accounts-seeded', () => {
    for (const extra of EXTRA_ACCOUNTS) {
      if (!data.accounts.some((a) => a.code === extra.code))
        data.accounts.push(structuredClone(extra));
    }
    return true;
  });
  return data.accounts;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The demo general ledger, derived from the demo documents so every screen agrees. */
export function demoLedger(data: DemoData): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  let n = 0;
  const post = (
    date: string,
    accountCode: string,
    amount: number,
    description: string,
    documentNumber?: string,
    sourceType?: string
  ) => {
    if (!amount) return;
    entries.push({
      id: `gl-${++n}`,
      date,
      accountCode,
      description,
      documentNumber,
      sourceType,
      debit: amount > 0 ? r2(amount) : 0,
      credit: amount < 0 ? r2(-amount) : 0,
    });
  };
  // Opening balances: the demo bank balances start before the first transaction.
  const opening = addDays(DEMO_TODAY(), -400);
  for (const [code, amount] of [
    ['090', 18_500],
    ['091', 25_000],
  ] as const) {
    post(opening, code, amount, 'Opening balance', 'OPENING', 'MANJOURNAL');
    post(opening, '970', -amount, 'Opening balance', 'OPENING', 'MANJOURNAL');
  }
  for (const i of data.invoices) {
    if (!['authorised', 'paid'].includes(i.status)) continue;
    const sales = i.type === 'sales';
    const sign = sales ? -1 : 1;
    post(
      i.date,
      sales ? '610' : '800',
      -sign * i.total,
      i.contact.name,
      i.number,
      sales ? 'ACCREC' : 'ACCPAY'
    );
    for (const l of i.lineItems ?? []) {
      post(
        i.date,
        l.accountCode ?? (sales ? '200' : '310'),
        sign * l.lineAmount,
        l.description,
        i.number,
        sales ? 'ACCREC' : 'ACCPAY'
      );
    }
    post(
      i.date,
      '820',
      sign * i.totalTax,
      `VAT on ${i.number}`,
      i.number,
      sales ? 'ACCREC' : 'ACCPAY'
    );
  }
  for (const t of data.bankTransactions) {
    if (t.status !== 'authorised') continue;
    const bank = data.bankAccounts.find((b) => b.id === t.bankAccountId)?.code ?? '090';
    const signed = t.type === 'receive' || t.type === 'transfer-in' ? t.amount : -t.amount;
    post(t.date, bank, signed, t.description ?? '', t.reference, 'CASH');
    // A transfer's two legs (one per bank account) balance each other.
    if (t.type === 'transfer-in' || t.type === 'transfer-out') continue;
    if (t.lineItems?.length) {
      let rest = -signed;
      for (const l of t.lineItems) {
        const amount = -Math.sign(signed) * l.lineAmount;
        rest -= amount;
        post(t.date, l.accountCode ?? '400', amount, l.description, t.reference, 'CASH');
      }
      post(
        t.date,
        '820',
        r2(rest),
        `VAT on ${t.reference ?? 'bank transaction'}`,
        t.reference,
        'CASH'
      );
    } else {
      post(
        t.date,
        t.type === 'receive' ? '610' : '800',
        -signed,
        t.description ?? '',
        t.reference,
        'CASH'
      );
    }
  }
  for (const l of demoPostedJournalLines(data)) {
    post(l.date, l.accountCode, l.amount, l.description ?? '', l.documentNumber, 'MANJOURNAL');
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/** The demo books' financial year starts on 1 April. */
function fyStart(today = DEMO_TODAY()) {
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) >= 4 ? `${year}-04-01` : `${year - 1}-04-01`;
}

export function demoAccounts(data: DemoData): AccountsModule {
  return {
    async list(options) {
      const accounts = structuredClone(chart(data)).sort((a, b) => a.code.localeCompare(b.code));
      if (!options?.withBalances) return accounts;
      const from = fyStart();
      const ledger = demoLedger(data);
      return accounts.map((a) => {
        const pl = a.class === 'revenue' || a.class === 'expense';
        const debit = ledger
          .filter((e) => e.accountCode === a.code && (!pl || e.date >= from))
          .reduce((s, e) => s + e.debit - e.credit, 0);
        const natural =
          a.class && ['liability', 'equity', 'revenue'].includes(a.class) ? -debit : debit;
        return { ...a, balance: r2(natural) };
      });
    },
    async create(input) {
      if (chart(data).some((a) => a.code === input.code)) {
        throw new ConnectorError(`Account code ${input.code} is already in use.`, 400, 'demo');
      }
      const known = XERO_TYPES[input.type];
      if (!known) throw new ConnectorError('Choose an account type.', 400, 'demo');
      const account: Account = {
        id: `acc-${input.code}`,
        code: input.code,
        name: input.name,
        type: input.type,
        typeLabel: known.label,
        class: known.class,
        taxType: input.taxType,
        description: input.description,
        status: 'active',
        isBank: input.type === 'BANK',
      };
      data.accounts.push(account);
      return structuredClone(account);
    },
    async ledger(query) {
      const entries = demoLedger(data).filter(
        (e) =>
          (!query?.accountCode || e.accountCode === query.accountCode) &&
          (!query?.from || e.date >= query.from) &&
          (!query?.to || e.date <= query.to)
      );
      return paginate(entries, query);
    },
  };
}
