import { describe, expect, it } from 'vitest';
import { createDemoConnector } from '../index';

describe('demo balance history', () => {
  it('agrees with the demo balances and register', async () => {
    const connector = createDemoConnector({
      key: 'demo.history-test',
      kind: 'demo',
      name: 'Contoso Coffee Roasters Ltd',
    } as Parameters<typeof createDemoConnector>[0]);
    const bank = connector.bank!;
    const [accounts, histories] = await Promise.all([bank.accounts(), bank.balanceHistory!()]);
    const today = new Date().toISOString().slice(0, 10);
    for (const account of accounts) {
      const history = histories.accounts[account.id];
      expect(history.interval).toBe('day');
      expect(history.points).toHaveLength(29);
      expect(history.points.at(-1)?.date).toBe(today);
      // Today's closing balance: the books balance less anything dated after today.
      const { items } = await bank.transactions(account.id, { pageSize: 1000 });
      const future = items
        .filter((t) => t.date > today)
        .reduce(
          (s, t) => s + (t.type === 'receive' || t.type === 'transfer-in' ? t.amount : -t.amount),
          0
        );
      expect(history.points.at(-1)!.balance).toBeCloseTo(account.balance! - future, 2);
      expect(account.feedDate).toBeDefined();
    }
    // The current account moves; walking back through the register explains every step.
    const current = histories.accounts['acc-090'];
    const from = current.points[0].date;
    const register = await bank.transactions('acc-090', { from, to: today, pageSize: 1000 });
    const net = register.items
      .filter((t) => t.date > from)
      .reduce(
        (s, t) => s + (t.type === 'receive' || t.type === 'transfer-in' ? t.amount : -t.amount),
        0
      );
    expect(current.points.at(-1)!.balance - current.points[0].balance).toBeCloseTo(net, 2);
  });
});
