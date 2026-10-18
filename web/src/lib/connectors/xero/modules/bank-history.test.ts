import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { XeroClient, XeroRequest } from '../client';
import type { XeroReport } from '../reports';
import type { XeroAccount } from './accounts';
import type { XeroBankTransaction, XeroPayment } from './bank';
import { xeroBank } from './bank';
import {
  XERO_FEED_NOTE,
  xeroBalanceHistory,
  xeroDailyHistories,
  xeroMovements,
  xeroWeeklyHistory,
} from './bank-history';
import { clearHistoryCache } from '../../balance-history';

/* Fixtures are shaped like the live API responses, with fictional values. */

const CURRENT = 'a1111111-0000-4000-8000-000000000001';
const SAVINGS = 'a2222222-0000-4000-8000-000000000002';
const EURO = 'a3333333-0000-4000-8000-000000000003';

const ACCOUNTS: XeroAccount[] = [
  { AccountID: CURRENT, Name: 'Business Current', Type: 'BANK', CurrencyCode: 'GBP' },
  { AccountID: SAVINGS, Name: 'Business Savings', Type: 'BANK', CurrencyCode: 'GBP' },
  { AccountID: EURO, Name: 'Euro Account', Type: 'BANK', CurrencyCode: 'EUR' },
] as XeroAccount[];

function summary(rows: [string, number, number][]): XeroReport {
  return {
    ReportName: 'Bank Summary',
    Rows: [
      { RowType: 'Header', Cells: [{ Value: 'Bank Accounts' }] },
      {
        RowType: 'Section',
        Rows: rows.map(([id, opening, closing]) => ({
          RowType: 'Row',
          Cells: [
            { Value: id, Attributes: [{ Id: 'accountID', Value: id }] },
            { Value: String(opening) },
            { Value: '0.00' },
            { Value: '0.00' },
            { Value: String(closing) },
          ],
        })),
      },
    ],
  } as XeroReport;
}

const tx = (
  account: string,
  type: string,
  date: string,
  total: number,
  status: XeroBankTransaction['Status'] = 'AUTHORISED'
): XeroBankTransaction => ({
  BankTransactionID: `${account}-${date}-${total}`,
  Type: type,
  BankAccount: { AccountID: account },
  DateString: `${date}T00:00:00`,
  Total: total,
  Status: status,
});

const payment = (
  account: string,
  type: string,
  date: string,
  amount: number,
  bankAmount?: number
): XeroPayment => ({
  PaymentID: `${account}-${date}-${amount}`,
  PaymentType: type,
  Date: `/Date(${Date.parse(`${date}T00:00:00Z`)}+0000)/`,
  Amount: amount,
  BankAmount: bankAmount,
  Status: 'AUTHORISED',
  Account: { AccountID: account },
});

describe('xero balance history mappers', () => {
  it('signs spend, receive, transfers and payments', () => {
    const movements = xeroMovements(
      [
        tx(CURRENT, 'SPEND', '2026-10-02', 40),
        tx(CURRENT, 'RECEIVE', '2026-10-03', 100),
        tx(CURRENT, 'SPEND-TRANSFER', '2026-10-04', 500),
        tx(SAVINGS, 'RECEIVE-TRANSFER', '2026-10-04', 500),
        tx(CURRENT, 'SPEND', '2026-10-05', 999, 'VOIDED'),
      ],
      [
        payment(CURRENT, 'ACCRECPAYMENT', '2026-10-06', 120),
        // A bill paid in another currency: the bank side is what moved.
        payment(CURRENT, 'ACCPAYPAYMENT', '2026-10-07', 100, 86.5),
      ]
    );
    expect(movements.get(CURRENT)).toEqual([
      { date: '2026-10-02', amount: -40 },
      { date: '2026-10-03', amount: 100 },
      { date: '2026-10-04', amount: -500 },
      { date: '2026-10-06', amount: 120 },
      { date: '2026-10-07', amount: -86.5 },
    ]);
    expect(movements.get(SAVINGS)).toEqual([{ date: '2026-10-04', amount: 500 }]);
  });

  it('keeps a daily history only when it ties out to Bank Summary’s opening balance', () => {
    const movements = new Map([
      [CURRENT, [{ date: '2026-10-03', amount: 200 }]],
      // Savings had a manual journal Bookie can't see, so it won't tie out.
      [SAVINGS, [{ date: '2026-10-03', amount: 50 }]],
    ]);
    const { daily, weekly } = xeroDailyHistories({
      accounts: ACCOUNTS,
      baseCurrency: 'GBP',
      summary: new Map([
        [CURRENT, { opening: 800, closing: 1000 }],
        [SAVINGS, { opening: 900, closing: 1000 }],
        [EURO, { opening: 300, closing: 300 }],
      ]),
      movements,
      from: '2026-10-01',
      to: '2026-10-04',
    });
    expect(daily[CURRENT]).toEqual({
      currency: 'GBP',
      interval: 'day',
      points: [
        { date: '2026-10-01', balance: 800 },
        { date: '2026-10-02', balance: 800 },
        { date: '2026-10-03', balance: 1000 },
        { date: '2026-10-04', balance: 1000 },
      ],
    });
    // Foreign-currency accounts: Bank Summary is in base currency, movements aren't.
    expect(weekly).toEqual([SAVINGS, EURO]);
  });

  it('falls back to weekly points when the movements are incomplete', () => {
    const { daily, weekly } = xeroDailyHistories({
      accounts: ACCOUNTS.slice(0, 1),
      baseCurrency: 'GBP',
      summary: new Map([[CURRENT, { opening: 1000, closing: 1000 }]]),
      movements: undefined,
      from: '2026-10-01',
      to: '2026-10-29',
    });
    expect(daily).toEqual({});
    expect(weekly).toEqual([CURRENT]);
  });

  it('builds weekly points from Bank Summary closing balances only', () => {
    const history = xeroWeeklyHistory(
      EURO,
      new Map([[EURO, { opening: 300, closing: 420 }]]),
      [
        { date: '2026-10-08', closing: new Map([[EURO, 310]]) },
        // Left out of that week's Bank Summary: nothing on it, so zero.
        { date: '2026-10-15', closing: new Map() },
        { date: '2026-10-22', closing: new Map([[EURO, 400]]) },
      ],
      '2026-10-01',
      '2026-10-29',
      'GBP'
    );
    expect(history).toEqual({
      currency: 'GBP',
      interval: 'week',
      points: [
        { date: '2026-10-01', balance: 300 },
        { date: '2026-10-08', balance: 310 },
        { date: '2026-10-15', balance: 0 },
        { date: '2026-10-22', balance: 400 },
        { date: '2026-10-29', balance: 420 },
      ],
    });
  });
});

describe('xeroBalanceHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    clearHistoryCache();
  });

  function fakeClient(respond: (path: string, request: XeroRequest) => unknown) {
    const calls: { path: string; request: XeroRequest }[] = [];
    const client = {
      cacheScope: 'tenant-a:conn-1:org-1',
      async request(path: string, request: XeroRequest = {}) {
        calls.push({ path, request });
        return respond(path, request);
      },
    } as unknown as XeroClient;
    return { client, calls };
  }

  it('reads daily history in four calls, all accounts at once, and caches it', async () => {
    const { client, calls } = fakeClient((path, request) => {
      if (path === 'Accounts') return { Accounts: ACCOUNTS.slice(0, 1) };
      if (path === 'Reports/BankSummary') {
        expect(request.query).toEqual({ fromDate: '2026-09-21', toDate: '2026-10-18' });
        return { Reports: [summary([[CURRENT, 1000, 1150]])] };
      }
      if (path === 'BankTransactions') {
        expect(request.query?.where).toBe(
          'Status=="AUTHORISED" AND Date>=DateTime(2026,09,21) AND Date<=DateTime(2026,10,18)'
        );
        return { BankTransactions: [tx(CURRENT, 'SPEND', '2026-10-01', 50)] };
      }
      if (path === 'Payments') {
        return { Payments: [payment(CURRENT, 'ACCRECPAYMENT', '2026-10-10', 200)] };
      }
      throw new Error(`unexpected ${path}`);
    });
    const result = await xeroBalanceHistory(client, async () => 'GBP');
    expect(calls).toHaveLength(4);
    const history = result.accounts[CURRENT];
    expect(history.interval).toBe('day');
    expect(history.points).toHaveLength(29);
    expect(history.points[0]).toEqual({ date: '2026-09-20', balance: 1000 });
    expect(history.points.find((p) => p.date === '2026-10-01')?.balance).toBe(950);
    expect(history.points.at(-1)).toEqual({ date: '2026-10-18', balance: 1150 });
    expect(result.readAt).toBe('2026-10-18T09:00:00.000Z');

    await xeroBalanceHistory(client, async () => 'GBP');
    expect(calls).toHaveLength(4);
  });

  it('adds three weekly Bank Summaries only when an account needs them', async () => {
    const { client, calls } = fakeClient((path, request) => {
      if (path === 'Accounts') return { Accounts: ACCOUNTS };
      if (path === 'Reports/BankSummary') {
        if (request.query?.fromDate === '2026-09-21') {
          return {
            Reports: [
              summary([
                [CURRENT, 1000, 1000],
                [EURO, 500, 650],
              ]),
            ],
          };
        }
        return { Reports: [summary([[EURO, 600, 600]])] };
      }
      // A full page: there may be more, so no daily reconstruction at all.
      if (path === 'BankTransactions') {
        return {
          BankTransactions: Array.from({ length: 1000 }, () =>
            tx(CURRENT, 'SPEND', '2026-10-01', 1)
          ),
        };
      }
      return { Payments: [] };
    });
    const result = await xeroBalanceHistory(client, async () => 'GBP');
    const weeklyCalls = calls.filter(
      (c) => c.path === 'Reports/BankSummary' && c.request.query?.fromDate !== '2026-09-21'
    );
    expect(weeklyCalls.map((c) => c.request.query)).toEqual([
      { fromDate: '2026-09-27', toDate: '2026-09-27' },
      { fromDate: '2026-10-04', toDate: '2026-10-04' },
      { fromDate: '2026-10-11', toDate: '2026-10-11' },
    ]);
    expect(result.accounts[EURO]).toMatchObject({ interval: 'week', currency: 'GBP' });
    expect(result.accounts[EURO].points.map((p) => p.balance)).toEqual([500, 600, 600, 600, 650]);
    // Savings isn't on any Bank Summary: nothing on it, so a flat zero, as on the card.
    expect(result.accounts[SAVINGS].points.every((p) => p.balance === 0)).toBe(true);
    expect(result.accounts[CURRENT].interval).toBe('week');
  });

  it('is on the bank module, with the feed note', () => {
    const bank = xeroBank({} as XeroClient);
    expect(bank.balanceHistory).toBeTypeOf('function');
    expect(bank.feedNote).toBe(XERO_FEED_NOTE);
  });
});
