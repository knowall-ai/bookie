import { describe, expect, it } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '../index';

/** A fresh demo org per test file run; writes persist in memory like the real demo. */
const connector = () => createDemoConnector(DEMO_ORGS[1]);

describe('demo accounting', () => {
  it('keeps a ledger that balances and agrees with the bank cards', async () => {
    const c = connector();
    const ledger = await c.accounts!.ledger!({ pageSize: 100_000 });
    const net = ledger.items.reduce((s, e) => s + e.debit - e.credit, 0);
    expect(Math.abs(net)).toBeLessThan(0.01);

    const [accounts, banks] = await Promise.all([
      c.accounts!.list({ withBalances: true }),
      c.bank!.accounts(),
    ]);
    for (const bank of banks) {
      const account = accounts.find((a) => a.code === bank.code);
      expect(account?.balance).toBeCloseTo(bank.balance ?? 0, 2);
    }
  });

  it('labels the chart like Xero and archives one account', async () => {
    const accounts = await connector().accounts!.list();
    expect(accounts.find((a) => a.code === '820')?.typeLabel).toBe('Current Liability');
    expect(accounts.filter((a) => a.status === 'archived')).toHaveLength(1);
  });

  it('records spend money against the bank balance', async () => {
    const c = connector();
    const before = (await c.bank!.accounts()).find((a) => a.id === 'acc-090')!.balance!;
    const tx = await c.bank!.createTransaction!({
      bankAccountId: 'acc-090',
      type: 'spend',
      contactId: 'supp-3',
      date: '2026-10-01',
      lineAmountType: 'exclusive',
      lineItems: [
        {
          description: 'Mailer boxes',
          quantity: 2,
          unitAmount: 50,
          accountCode: '310',
          taxType: 'INPUT2',
        },
      ],
    });
    expect(tx.amount).toBe(120);
    const after = (await c.bank!.accounts()).find((a) => a.id === 'acc-090')!.balance!;
    expect(after).toBeCloseTo(before - 120, 2);
    const register = await c.bank!.transactions('acc-090', { search: 'Mailer' });
    expect(register.items[0].id).toBe(tx.id);
  });

  it('only accepts balanced manual journals and lists them by status', async () => {
    const c = connector();
    await expect(
      c.journals!.create!({
        date: '2026-10-01',
        narration: 'Bad',
        lines: [{ accountCode: '400', amount: 10 }],
      })
    ).rejects.toThrow(/balance/);
    const created = await c.journals!.create!({
      date: '2026-10-02',
      narration: 'Accrue water',
      status: 'draft',
      lines: [
        { accountCode: '445', amount: 42 },
        { accountCode: '825', amount: -42 },
      ],
    });
    const drafts = await c.journals!.list({ status: 'draft' });
    expect(drafts.items.map((j) => j.id)).toContain(created.id);
    expect((await c.journals!.get(created.id)).lines[0].accountName).toBe('Light, Power, Heating');
    const posted = await c.journals!.list({ status: 'posted' });
    expect(posted.items.every((j) => j.status === 'posted')).toBe(true);
  });

  it('filters assets by status', async () => {
    const c = connector();
    const [draft, registered, disposed] = await Promise.all(
      (['draft', 'registered', 'disposed'] as const).map((status) => c.assets!.list({ status }))
    );
    expect(draft.items.every((a) => a.status === 'draft')).toBe(true);
    expect(registered.total).toBeGreaterThan(0);
    expect(disposed.items.every((a) => a.bookValue === 0)).toBe(true);
  });
});
