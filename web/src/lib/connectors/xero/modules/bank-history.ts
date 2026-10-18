/**
 * Balance over the last four weeks for Xero bank accounts.
 *
 * Xero's API has no balance-by-date for a bank account (the Bank Statement
 * report answers 401 to Bookie's connection), so Bookie reconstructs it:
 *
 * 1. One Bank Summary for the window gives every account's opening and closing
 *    balance (base currency).
 * 2. BankTransactions and Payments for the window (two calls, up to 1,000 each,
 *    all accounts at once) give the day-by-day movements.
 * 3. Walking back from the closing balance through those movements gives a daily
 *    closing balance. It is kept only if it lands exactly on Bank Summary's
 *    opening balance; anything Xero moves that those endpoints don't list (a
 *    manual journal to a bank account, say) makes it miss, and it is dropped.
 * 4. Accounts that don't tie out, or are in a foreign currency (Bank Summary is
 *    in base currency, movements are not), get weekly points instead: three more
 *    Bank Summary calls for the closing balance a week, two and three weeks ago.
 *
 * That's four calls (seven at most), cached five minutes per tenant and organisation.
 */
import type { BalanceHistory, BankBalanceHistories, IsoDate } from '@/lib/domain/types';
import { xeroDate, type XeroClient } from '../client';
import { today } from '../mappers';
import type { XeroReport } from '../reports';
import type { XeroAccount } from './accounts';
import {
  bankSummaryBalances,
  closingBalances,
  MAX_MERGE,
  RECEIVING_PAYMENTS,
  type XeroBankTransaction,
  type XeroPayment,
} from './bank';
import {
  addDays,
  cachedHistories,
  historyWindow,
  reconstructDaily,
  tiesOut,
  type Movement,
} from '../../balance-history';

export const XERO_FEED_NOTE =
  "Xero's API doesn't say when the bank feed last brought in a statement line. Check the account in Xero.";

/** Signed movements (money in positive) per bank account id. */
export function xeroMovements(
  transactions: XeroBankTransaction[],
  payments: XeroPayment[]
): Map<string, Movement[]> {
  const byAccount = new Map<string, Movement[]>();
  const add = (id: string | undefined, date: IsoDate | undefined, amount: number) => {
    if (!id || !date) return;
    const list = byAccount.get(id) ?? [];
    list.push({ date, amount });
    byAccount.set(id, list);
  };
  for (const t of transactions) {
    if (t.Status !== 'AUTHORISED') continue;
    const sign = t.Type.startsWith('SPEND') ? -1 : 1;
    add(t.BankAccount.AccountID, xeroDate(t.DateString ?? t.Date), sign * (t.Total ?? 0));
  }
  for (const p of payments) {
    if (p.Status !== 'AUTHORISED') continue;
    const sign = RECEIVING_PAYMENTS.has(p.PaymentType) ? 1 : -1;
    add(p.Account?.AccountID, xeroDate(p.Date), sign * (p.BankAmount ?? p.Amount ?? 0));
  }
  return byAccount;
}

export interface XeroHistoryInput {
  /** Active bank accounts. */
  accounts: XeroAccount[];
  baseCurrency?: string;
  /** Bank Summary from the day after `from` to `to`. */
  summary: Map<string, { opening?: number; closing: number }>;
  /** Movements in the window, or undefined when Xero's lists were cut short or failed. */
  movements?: Map<string, Movement[]>;
  from: IsoDate;
  to: IsoDate;
}

/** Daily histories that tie out, and the accounts that need weekly Bank Summary points. */
export function xeroDailyHistories(input: XeroHistoryInput) {
  const daily: Record<string, BalanceHistory> = {};
  const weekly: string[] = [];
  for (const account of input.accounts) {
    const id = account.AccountID;
    const currency = account.CurrencyCode || input.baseCurrency;
    if (!currency) continue;
    const foreign = !!input.baseCurrency && currency !== input.baseCurrency;
    // Bank Summary leaves out accounts with nothing on them: zero, as on the card.
    const { opening, closing } = input.summary.get(id) ?? { opening: 0, closing: 0 };
    if (!foreign && input.movements && opening !== undefined) {
      const points = reconstructDaily(closing, input.movements.get(id) ?? [], input.from, input.to);
      if (tiesOut(points[0].balance, opening)) {
        daily[id] = { points, currency, interval: 'day' };
        continue;
      }
    }
    weekly.push(id);
  }
  return { daily, weekly };
}

/**
 * Weekly points from Bank Summary closing balances: the window's opening, each
 * checkpoint date's closing, and today's closing. In base currency, as Xero gives it.
 */
export function xeroWeeklyHistory(
  id: string,
  summary: Map<string, { opening?: number; closing: number }>,
  checkpoints: { date: IsoDate; closing: Map<string, number> }[],
  from: IsoDate,
  to: IsoDate,
  currency: string
): BalanceHistory | undefined {
  const window = summary.get(id) ?? { opening: 0, closing: 0 };
  if (window.opening === undefined) return undefined;
  return {
    points: [
      { date: from, balance: window.opening },
      ...checkpoints.map((c) => ({ date: c.date, balance: c.closing.get(id) ?? 0 })),
      { date: to, balance: window.closing },
    ],
    currency,
    interval: 'week',
  };
}

const dateTime = (date: IsoDate) => `DateTime(${date.replaceAll('-', ',')})`;

export function xeroBalanceHistory(
  client: XeroClient,
  baseCurrency: () => Promise<string | undefined>
): Promise<BankBalanceHistories> {
  return cachedHistories(`${client.cacheScope}:bank-history`, async () => {
    const to = today();
    const { from } = historyWindow(to);
    const start = addDays(from, 1);
    const window = `Status=="AUTHORISED" AND Date>=${dateTime(start)} AND Date<=${dateTime(to)}`;
    const summaryFor = (fromDate: IsoDate, toDate: IsoDate) =>
      client
        .request<{ Reports: XeroReport[] }>('Reports/BankSummary', { query: { fromDate, toDate } })
        .then((r) => r.Reports[0]);
    const [accounts, summary, transactions, payments, base] = await Promise.all([
      client.request<{ Accounts: XeroAccount[] }>('Accounts', {
        query: { where: 'Type=="BANK" AND Status=="ACTIVE"' },
      }),
      summaryFor(start, to).then(bankSummaryBalances),
      client
        .request<{ BankTransactions: XeroBankTransaction[] }>('BankTransactions', {
          query: { where: window, page: 1, pageSize: MAX_MERGE },
        })
        .catch(() => undefined),
      client
        .request<{ Payments: XeroPayment[] }>('Payments', {
          query: { where: window, page: 1, pageSize: MAX_MERGE },
        })
        .catch(() => undefined),
      baseCurrency().catch(() => undefined),
    ]);
    // A full page may mean more: then the movements are incomplete and can't be used.
    const complete =
      transactions &&
      payments &&
      transactions.BankTransactions.length < MAX_MERGE &&
      payments.Payments.length < MAX_MERGE;
    const movements = complete
      ? xeroMovements(transactions.BankTransactions, payments.Payments)
      : undefined;
    const { daily, weekly } = xeroDailyHistories({
      accounts: accounts.Accounts,
      baseCurrency: base,
      summary,
      movements,
      from,
      to,
    });
    const result: Record<string, BalanceHistory> = { ...daily };
    let note: string | undefined;
    if (weekly.length) {
      const dates = [7, 14, 21].map((n) => addDays(from, n));
      const checkpoints = await Promise.all(
        dates.map(async (date) => ({
          date,
          closing: closingBalances(await summaryFor(date, date)),
        }))
      ).catch(() => undefined);
      if (checkpoints) {
        for (const id of weekly) {
          // Bank Summary's figures are in base currency, foreign-currency accounts included,
          // so without the base currency there's no saying what they're in.
          if (!base) continue;
          const history = xeroWeeklyHistory(id, summary, checkpoints, from, to, base);
          if (history) result[id] = history;
        }
      } else {
        note = "Xero didn't return the weekly Bank Summary, so some accounts have no history.";
      }
    }
    return { readAt: new Date().toISOString(), accounts: result, note };
  });
}
