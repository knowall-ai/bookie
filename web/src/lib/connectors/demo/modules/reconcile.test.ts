import { describe, expect, it } from 'vitest';
import { DEMO_ORGS, createDemoConnector } from '../index';
import { reconcileLines, type BankLine } from '@/lib/reconcile/match';

// A demo org of its own: these tests record a payment.
const org = { ...DEMO_ORGS[0], key: 'demo.reconcile-test' };

describe('demo bank feed for Reconcile', () => {
  it('has a line for every case, each in the account currency', async () => {
    const connector = createDemoConnector(org);
    const bank = connector.bank!;
    const lines: BankLine[] = await bank.statementLines!('acc-090');
    expect(lines.every((l) => l.currency === 'GBP')).toBe(true);

    const [sales, bills, register] = await Promise.all([
      connector.invoices!.list('sales', { status: 'authorised', pageSize: 100 }),
      connector.invoices!.list('purchase', { status: 'authorised', pageSize: 100 }),
      bank.transactions('acc-090', { reconciled: false, pageSize: 200 }),
    ]);
    const outcomes = [
      ...reconcileLines(lines, [...sales.items, ...bills.items], register.items, {
        accountCurrency: 'GBP',
        sourceName: 'the demo',
      }).values(),
    ];
    const reasons = outcomes.flatMap((o) =>
      o.kind === 'suggestions' ? o.suggestions.flatMap((s) => s.reasons) : []
    );
    expect(reasons).toContain('same amount');
    expect(reasons.some((r) => r.startsWith('part-payment'))).toBe(true);
    expect(reasons.some((r) => /^reference has PO \d+$/.test(r))).toBe(true);
    expect(outcomes.some((o) => o.kind === 'no-match' && o.otherCurrency.length === 0)).toBe(true);
    expect(outcomes.some((o) => o.kind === 'no-match' && o.otherCurrency.length > 0)).toBe(true);
    expect(outcomes.some((o) => o.kind === 'already-recorded')).toBe(true);
  });

  it('shows a matched line as already recorded once the payment exists', async () => {
    const connector = createDemoConnector(org);
    const bank = connector.bank!;
    const lines = await bank.statementLines!('acc-090');
    const sales = await connector.invoices!.list('sales', { status: 'authorised', pageSize: 100 });
    const options = { accountCurrency: 'GBP', sourceName: 'the demo' };
    const before = reconcileLines(lines, sales.items, [], options);
    const [lineId, outcome] = [...before].find(([, o]) => o.kind === 'suggestions')!;
    if (outcome.kind !== 'suggestions') throw new Error('expected suggestions');
    const line = lines.find((l) => l.id === lineId)!;
    await connector.payments!.create!({
      invoiceId: outcome.suggestions[0].invoice.id,
      bankAccountId: 'acc-090',
      date: line.date,
      amount: line.amount,
      reference: line.reference,
    });
    const register = await bank.transactions('acc-090', { reconciled: false, pageSize: 200 });
    const after = reconcileLines(lines, sales.items, register.items, options);
    expect(after.get(lineId)?.kind).toBe('already-recorded');
  });
});
