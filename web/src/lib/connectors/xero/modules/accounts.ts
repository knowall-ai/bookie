import type { Account, AccountClass, AccountInput, LedgerEntry, Page } from '@/lib/domain/types';
import { xeroDate, type XeroClient } from '../client';
import { today } from '../mappers';
import { fromXeroReport, type XeroReport } from '../reports';
import type { AccountsModule } from '../../types';

/* Raw shapes (only what Bookie reads). */

export interface XeroAccount {
  AccountID: string;
  Code?: string;
  Name: string;
  Type: string;
  Class?: 'ASSET' | 'EQUITY' | 'EXPENSE' | 'LIABILITY' | 'REVENUE';
  Status?: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  TaxType?: string;
  Description?: string;
  BankAccountNumber?: string;
  BankAccountType?: string;
  CurrencyCode?: string;
  SystemAccount?: string;
}

export interface XeroJournal {
  JournalID: string;
  JournalNumber: number;
  JournalDate: string;
  Reference?: string;
  SourceType?: string;
  JournalLines: {
    JournalLineID: string;
    AccountCode?: string;
    AccountName?: string;
    Description?: string;
    NetAmount?: number;
  }[];
}

/** Xero's account types with the labels Xero itself shows in the chart of accounts. */
export const XERO_ACCOUNT_TYPES: Record<string, { label: string; class: AccountClass }> = {
  BANK: { label: 'Bank', class: 'asset' },
  CURRENT: { label: 'Current Asset', class: 'asset' },
  FIXED: { label: 'Fixed Asset', class: 'asset' },
  INVENTORY: { label: 'Inventory', class: 'asset' },
  NONCURRENT: { label: 'Non-current Asset', class: 'asset' },
  PREPAYMENT: { label: 'Prepayment', class: 'asset' },
  CURRLIAB: { label: 'Current Liability', class: 'liability' },
  LIABILITY: { label: 'Liability', class: 'liability' },
  TERMLIAB: { label: 'Non-current Liability', class: 'liability' },
  PAYGLIABILITY: { label: 'PAYG Liability', class: 'liability' },
  SUPERANNUATIONLIABILITY: { label: 'Superannuation Liability', class: 'liability' },
  WAGESPAYABLELIABILITY: { label: 'Wages Payable Liability', class: 'liability' },
  EQUITY: { label: 'Equity', class: 'equity' },
  DEPRECIATN: { label: 'Depreciation', class: 'expense' },
  DIRECTCOSTS: { label: 'Direct Costs', class: 'expense' },
  EXPENSE: { label: 'Expense', class: 'expense' },
  OVERHEADS: { label: 'Overhead', class: 'expense' },
  SUPERANNUATIONEXPENSE: { label: 'Superannuation Expense', class: 'expense' },
  WAGESEXPENSE: { label: 'Wages Expense', class: 'expense' },
  OTHERINCOME: { label: 'Other Income', class: 'revenue' },
  REVENUE: { label: 'Revenue', class: 'revenue' },
  SALES: { label: 'Sales', class: 'revenue' },
};

const CLASS: Record<NonNullable<XeroAccount['Class']>, AccountClass> = {
  ASSET: 'asset',
  EQUITY: 'equity',
  EXPENSE: 'expense',
  LIABILITY: 'liability',
  REVENUE: 'revenue',
};

/** Accounts whose balances are naturally credits; their YTD shows credit-positive, as in Xero. */
export const CREDIT_NORMAL: AccountClass[] = ['liability', 'equity', 'revenue'];

export function fromXeroAccount(raw: XeroAccount): Account {
  const known = XERO_ACCOUNT_TYPES[raw.Type];
  return {
    id: raw.AccountID,
    code: raw.Code ?? '',
    name: raw.Name,
    type: raw.Type,
    typeLabel: known?.label ?? raw.Type,
    // Unknown class stays unknown (never assumed to be an asset).
    class: (raw.Class && CLASS[raw.Class]) ?? known?.class,
    taxType: raw.TaxType || undefined,
    description: raw.Description || undefined,
    status: raw.Status === 'ACTIVE' ? 'active' : 'archived',
    isBank: raw.Type === 'BANK',
  };
}

/**
 * YTD balance per account id from Xero's Trial Balance report
 * (columns: Account, Debit, Credit, YTD Debit, YTD Credit). Debit-positive.
 */
export function trialBalanceByAccount(report: XeroReport): Map<string, number> {
  const tb = fromXeroReport('trial-balance', report);
  const balances = new Map<string, number>();
  for (const row of tb.sections.flatMap((s) => s.rows)) {
    if (row.kind !== 'row' || !row.accountId) continue;
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);
    balances.set(row.accountId, num(row.cells[3]) - num(row.cells[4]));
  }
  return balances;
}

export function fromXeroJournal(journal: XeroJournal): LedgerEntry[] {
  return journal.JournalLines.map((line) => {
    const amount = line.NetAmount ?? 0;
    return {
      id: line.JournalLineID,
      date: xeroDate(journal.JournalDate) ?? '',
      accountCode: line.AccountCode ?? '',
      accountName: line.AccountName || undefined,
      description: line.Description || journal.Reference || undefined,
      documentNumber: journal.Reference || String(journal.JournalNumber),
      sourceType: journal.SourceType,
      debit: amount > 0 ? amount : 0,
      credit: amount < 0 ? -amount : 0,
    };
  });
}

export function toXeroAccount(input: AccountInput): Record<string, unknown> {
  return {
    Code: input.code,
    Name: input.name,
    Type: input.type,
    TaxType: input.taxType || undefined,
    Description: input.description || undefined,
  };
}

/** Xero returns 100 journals per call, oldest first, keyed by journal number offset. */
const JOURNALS_PER_CALL = 100;

export function xeroAccounts(client: XeroClient): AccountsModule {
  return {
    async list(options) {
      const [result, report] = await Promise.all([
        client.request<{ Accounts: XeroAccount[] }>('Accounts', { query: { order: 'Code ASC' } }),
        options?.withBalances
          ? client
              .request<{ Reports: XeroReport[] }>('Reports/TrialBalance', {
                query: { date: today() },
              })
              .then((r) => r.Reports[0])
              .catch(() => undefined)
          : undefined,
      ]);
      const balances = report ? trialBalanceByAccount(report) : undefined;
      return result.Accounts.filter((a) => a.Status !== 'DELETED').map((raw) => {
        const account = fromXeroAccount(raw);
        // Xero's trial balance leaves out accounts with a zero balance, so a missing
        // account is at zero. Without a class the sign is unknown, so no balance.
        if (balances && account.class) {
          const debit = balances.get(raw.AccountID) ?? 0;
          account.balance = CREDIT_NORMAL.includes(account.class) ? -debit : debit;
        }
        return account;
      });
    },
    async create(input) {
      const result = await client.request<{ Accounts: XeroAccount[] }>('Accounts', {
        method: 'PUT',
        body: toXeroAccount(input),
      });
      return fromXeroAccount(result.Accounts[0]);
    },
    async ledger(query): Promise<Page<LedgerEntry>> {
      const page = query?.page ?? 1;
      const result = await client.request<{ Journals: XeroJournal[] }>('Journals', {
        query: { offset: (page - 1) * JOURNALS_PER_CALL },
      });
      const items = result.Journals.flatMap(fromXeroJournal).filter(
        (e) => !query?.accountCode || e.accountCode === query.accountCode
      );
      return {
        items,
        page,
        pageSize: JOURNALS_PER_CALL,
        hasMore: result.Journals.length >= JOURNALS_PER_CALL,
      };
    },
  };
}
