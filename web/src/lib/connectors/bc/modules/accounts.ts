import type { Account, AccountClass, LedgerEntry } from '@/lib/domain/types';
import { odataString, type BcClient, type ODataList } from '../client';
import type { AccountsModule } from '../../types';
import { bcFiscalYear } from '../fiscal-year';
import { todayIso } from '@/lib/domain/dates';

/* Raw shapes (BC API v2.0). Enum values arrive XML-encoded, e.g. `Cost_x0020_of_x0020_Goods_x0020_Sold`. */

export interface BcAccount {
  id: string;
  number: string;
  displayName: string;
  category: string;
  subCategory?: string;
  blocked?: boolean;
  accountType: string;
  directPosting?: boolean;
}

export interface BcTrialBalanceLine {
  accountId: string;
  number: string;
  accountType: string;
  totalDebit: string;
  totalCredit: string;
  balanceAtDateDebit: string;
  balanceAtDateCredit: string;
}

export interface BcGlEntry {
  id: string;
  entryNumber: number;
  postingDate: string;
  documentNumber?: string;
  documentType?: string;
  accountNumber: string;
  description?: string;
  debitAmount?: number;
  creditAmount?: number;
}

/** `Cost_x0020_of_x0020_Goods_x0020_Sold` → `Cost of Goods Sold`; `_x0020_` (blank) → ``. */
export function decodeBcEnum(value: string | undefined): string {
  return (value ?? '')
    .replace(/_x([0-9A-F]{4})_/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

const CATEGORY_CLASS: Record<string, AccountClass> = {
  Assets: 'asset',
  Liabilities: 'liability',
  Equity: 'equity',
  Income: 'revenue',
  'Cost of Goods Sold': 'expense',
  Expense: 'expense',
};

/** Profit-and-loss classes: their YTD figure is the movement since the financial year began. */
const PL_CLASSES: AccountClass[] = ['revenue', 'expense'];
const CREDIT_NORMAL: AccountClass[] = ['liability', 'equity', 'revenue'];

export function fromBcAccount(raw: BcAccount): Account {
  const category = decodeBcEnum(raw.category);
  return {
    id: raw.id,
    code: raw.number,
    name: raw.displayName,
    type: category || 'Posting',
    typeLabel: raw.subCategory || category || 'Uncategorised',
    // BC can leave an account uncategorised: its class is then unknown, not "asset".
    class: CATEGORY_CLASS[category],
    status: raw.blocked ? 'archived' : 'active',
    // Bank accounts are their own entity in BC; G/L accounts are never "bank" accounts.
    isBank: false,
  };
}

/** BC's trial balance returns amounts as display strings ("1,234.50"). */
export function bcAmount(value: string | number | undefined): number {
  if (typeof value === 'number') return value;
  const n = Number((value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** YTD balance in the account's natural sign (credits positive for liabilities, equity, revenue). */
export function ytdBalance(
  account: Account,
  line: BcTrialBalanceLine | undefined
): number | undefined {
  // No trial balance line, or no category to know the sign by: not available, not zero.
  if (!line || !account.class) return undefined;
  const debit = PL_CLASSES.includes(account.class)
    ? bcAmount(line.totalDebit) - bcAmount(line.totalCredit)
    : bcAmount(line.balanceAtDateDebit) - bcAmount(line.balanceAtDateCredit);
  const natural = CREDIT_NORMAL.includes(account.class) ? -debit : debit;
  return Math.round(natural * 100) / 100;
}

export function fromBcGlEntry(raw: BcGlEntry): LedgerEntry {
  return {
    id: raw.id,
    date: raw.postingDate?.slice(0, 10) ?? '',
    accountCode: raw.accountNumber,
    description: raw.description || undefined,
    documentNumber: raw.documentNumber || undefined,
    sourceType: decodeBcEnum(raw.documentType) || undefined,
    debit: raw.debitAmount ?? 0,
    credit: raw.creditAmount ?? 0,
  };
}

const today = todayIso;

export function bcAccounts(client: BcClient): AccountsModule {
  const fiscalYear = bcFiscalYear(client);

  return {
    async list(options) {
      // Headings and totals are layout rows in BC, not accounts you can post to.
      const accounts = (
        await client.all<BcAccount>('accounts', {
          $filter: "accountType eq 'Posting'",
          $orderby: 'number',
        })
      ).map(fromBcAccount);
      if (!options?.withBalances) return accounts;
      // P&L accounts show the movement since the financial year began, so they need
      // BC's real year start. Without one, only balance-sheet balances (as at today,
      // whatever the range start) are shown.
      const fy = await fiscalYear(today());
      const lines = await client
        .all<BcTrialBalanceLine>('trialBalances', {
          $filter: `dateFilter ge ${fy.start ?? today()} and dateFilter le ${today()}`,
        })
        .catch(() => undefined);
      if (!lines) return accounts;
      const byId = new Map(lines.map((l) => [l.accountId, l]));
      return accounts.map((a) => ({
        ...a,
        balance:
          !fy.start && a.class && PL_CLASSES.includes(a.class)
            ? undefined
            : ytdBalance(a, byId.get(a.id)),
      }));
    },
    // BC API v2.0 exposes `accounts` read-only: there is no API to create a G/L account.
    async ledger(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      const filters: string[] = [];
      if (query?.accountCode) filters.push(`accountNumber eq ${odataString(query.accountCode)}`);
      if (query?.from) filters.push(`postingDate ge ${query.from}`);
      if (query?.to) filters.push(`postingDate le ${query.to}`);
      const result = await client.request<ODataList<BcGlEntry>>('generalLedgerEntries', {
        query: {
          $filter: filters.join(' and ') || undefined,
          $orderby: 'entryNumber desc',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      return {
        items: result.value.slice(0, pageSize).map(fromBcGlEntry),
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
      };
    },
  };
}
