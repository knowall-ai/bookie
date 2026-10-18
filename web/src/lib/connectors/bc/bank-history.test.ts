import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BcClient } from './client';
import {
  bcBalanceHistories,
  extensionBalanceHistory,
  type BcBankAccountBalance,
} from './extension';
import { bcBank, BC_FEED_NOTE } from './modules/bank';
import { clearHistoryCache } from '../balance-history';

/* Fixtures are shaped like the Bookie BC extension's API responses, with fictional values. */

const COMPANY = '11111111-2222-3333-4444-555555555555';
const CURRENT = 'BBBBBBBB-0000-4000-8000-000000000001';
const EURO = 'bbbbbbbb-0000-4000-8000-000000000002';

const BALANCES: BcBankAccountBalance[] = [
  { id: CURRENT, number: 'B010', currencyCode: '', balance: 1500 },
  { id: EURO, number: 'B020', currencyCode: 'EUR', balance: 300 },
  { id: 'bbbbbbbb-0000-4000-8000-000000000003', number: 'B030', blocked: true, balance: 9 },
];

describe('bc balance history mapper', () => {
  it('walks back from Balance through the bank ledger, future postings taken out', () => {
    const histories = bcBalanceHistories(
      BALANCES,
      [
        { bankAccountNumber: 'B010', postingDate: '2026-10-02', amount: 200 },
        { bankAccountNumber: 'B010', postingDate: '2026-10-03', amount: -50 },
        // Posted ahead of today: in Balance, not yet in today's closing balance.
        { bankAccountNumber: 'B010', postingDate: '2026-10-10', amount: 350 },
        { bankAccountNumber: 'B020', postingDate: '2026-10-03', amount: 100 },
      ],
      'GBP',
      '2026-10-01',
      '2026-10-04'
    );
    expect(histories[CURRENT.toLowerCase()]).toEqual({
      currency: 'GBP',
      interval: 'day',
      points: [
        { date: '2026-10-01', balance: 1000 },
        { date: '2026-10-02', balance: 1200 },
        { date: '2026-10-03', balance: 1150 },
        { date: '2026-10-04', balance: 1150 },
      ],
    });
    // In the account's own currency, as BC keeps the bank ledger.
    expect(histories[EURO].currency).toBe('EUR');
    expect(histories[EURO].points.map((p) => p.balance)).toEqual([200, 200, 300, 300]);
    expect(Object.keys(histories)).toHaveLength(2);
  });
});

describe('extensionBalanceHistory', () => {
  const client = () =>
    new BcClient({
      tenantId: 'tenant-a',
      environment: 'Sandbox',
      companyId: COMPANY,
      token: async () => 'token',
    });
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T09:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearHistoryCache();
  });

  function stub(ledger: (url: URL) => Response) {
    fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname.endsWith('/bankAccountBalances')) return json({ value: BALANCES });
      if (url.pathname.endsWith('/bankAccountLedgerEntries')) return ledger(url);
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('reads every entry after the window opens, once per tenant and company', async () => {
    stub((url) => {
      expect(url.searchParams.get('$filter')).toBe('postingDate gt 2026-09-20');
      return json({
        value: [{ bankAccountNumber: 'B010', postingDate: '2026-10-01', amount: 500 }],
      });
    });
    const result = await extensionBalanceHistory(client(), async () => 'GBP');
    const current = result.accounts[CURRENT.toLowerCase()];
    expect(current.points).toHaveLength(29);
    expect(current.points[0]).toEqual({ date: '2026-09-20', balance: 1000 });
    expect(current.points.at(-1)).toEqual({ date: '2026-10-18', balance: 1500 });
    await extensionBalanceHistory(client(), async () => 'GBP');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows no history rather than one built from a list cut short', async () => {
    stub(() =>
      json({
        value: [],
        '@odata.nextLink':
          'https://api.businesscentral.dynamics.com/v2.0/tenant-a/Sandbox/api/knowallBookie/bookie/v1.0/companies(x)/bankAccountLedgerEntries?$skiptoken=1',
      })
    );
    await expect(extensionBalanceHistory(client(), async () => 'GBP')).rejects.toThrow(
      /more than 10 pages/
    );
  });

  it('is only on the bank module with the Bookie extension', () => {
    expect(bcBank(client(), async () => 'GBP').balanceHistory).toBeUndefined();
    expect(bcBank(client(), async () => 'GBP', {}, true).balanceHistory).toBeTypeOf('function');
    expect(bcBank(client(), async () => 'GBP').feedNote).toBe(BC_FEED_NOTE);
  });
});
