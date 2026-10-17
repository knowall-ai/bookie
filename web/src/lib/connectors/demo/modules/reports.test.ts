import { describe, expect, it } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '../index';
import { findReportValue } from '../../xero/reports';
import type { Report } from '@/lib/domain/types';

const connector = createDemoConnector(DEMO_ORGS[0]);
const total = (report: Report, label: RegExp, column = 1) => findReportValue(report, label, column);

describe('demo reports', () => {
  it('offers every report', () => {
    expect(connector.reports?.available).toHaveLength(10);
  });

  it('P&L for the financial year to date agrees with the home dashboard', async () => {
    const dashboard = await connector.dashboard();
    const pl = dashboard.profitAndLoss!;
    const report = await connector.reports!.run('profit-and-loss', { from: pl.from, to: pl.to });
    expect(total(report, /^Total Trading Income$/)).toBeCloseTo(pl.income, 2);
    expect(total(report, /^Net Profit$/)).toBeCloseTo(pl.net, 2);
  });

  it('balance sheet balances and trial balance debits equal credits', async () => {
    const bs = await connector.reports!.run('balance-sheet', { periods: 2, timeframe: 'month' });
    expect(bs.columns).toHaveLength(4);
    for (const column of [1, 2, 3]) {
      expect(total(bs, /^Net Assets$/, column)).toBeCloseTo(
        total(bs, /^Total Equity$/, column)!,
        2
      );
    }
    const tb = await connector.reports!.run('trial-balance');
    const row = tb.sections.at(-1)!.rows[0];
    expect(row.cells[0]).toBe('Total');
    expect(row.cells[1]).toBeCloseTo(row.cells[2] as number, 2);
  });

  it('aged receivables total equals what customers owe on the dashboard', async () => {
    const dashboard = await connector.dashboard();
    const aged = await connector.reports!.run('aged-receivables');
    expect(total(aged, /^Total$/, 7)).toBeCloseTo(dashboard.receivables.awaitingPayment.total, 2);
    const payables = await connector.reports!.run('aged-payables');
    expect(total(payables, /^Total$/, 7)).toBeCloseTo(dashboard.payables.awaitingPayment.total, 2);
  });

  it('bank summary closes on the dashboard bank balances', async () => {
    const dashboard = await connector.dashboard();
    const today = new Date().toISOString().slice(0, 10);
    const bank = await connector.reports!.run('bank-summary', {
      from: `${today.slice(0, 8)}01`,
      to: today,
    });
    const closing = total(bank, /^Total$/, 4)!;
    const balances = dashboard.bankAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    expect(closing).toBeCloseTo(balances, 2);
  });

  it('runs executive summary and cash flow', async () => {
    const exec = await connector.reports!.run('executive-summary');
    expect(exec.columns).toHaveLength(4);
    expect(exec.sections.map((s) => s.title)).toContain('Profitability');
    const cf = await connector.reports!.run('cash-flow');
    expect(cf.sections[0].title).toBe('Operating Activities');
  });
});
