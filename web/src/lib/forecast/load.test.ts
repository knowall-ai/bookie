import { describe, expect, it } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '@/lib/connectors/demo';
import { runTool } from '@/lib/bookie/tools';
import { loadForecast } from './load';
import type { PlannedItem } from './types';

const today = new Date().toISOString().slice(0, 10);
const connector = () => createDemoConnector(DEMO_ORGS[0]);

describe('loadForecast on the demo books', () => {
  it('opens on the real bank balances and adds approved documents by due date', async () => {
    const c = connector();
    const { forecast, currencies } = await loadForecast(
      c,
      [],
      { horizon: '13w' },
      'the demo',
      today
    );
    expect(currencies[0]).toBe('GBP');
    const balances = (await c.bank!.accounts()).reduce((s, a) => s + (a.balance ?? 0), 0);
    expect(forecast.opening.balance).toBeCloseTo(balances, 2);

    const sales = (await c.invoices!.list('sales', { status: 'authorised', pageSize: 500 })).items;
    const dueIn = sales.filter(
      (i) => i.currency === 'GBP' && i.dueDate! >= today && i.dueDate! <= forecast.end
    );
    expect(forecast.totals.knownIn).toBeCloseTo(
      dueIn.reduce((s, i) => s + (i.amountDue ?? 0), 0),
      2
    );
    const overdue = sales.filter((i) => i.currency === 'GBP' && i.dueDate! < today);
    expect(forecast.overdue.in.count).toBe(overdue.length);
    expect(forecast.layers).toMatchObject({ drafts: false, projected: false });
  });

  it('offers a projection from everyday bank transactions, off by default', async () => {
    const off = await loadForecast(connector(), [], { horizon: '6m' }, 'the demo', today);
    expect(off.projection.available).toBe(true);
    expect(off.forecast.projection).toBeUndefined();
    const on = await loadForecast(
      connector(),
      [],
      { horizon: '6m', projectionMonths: 3 },
      'the demo',
      today
    );
    expect(on.forecast.projection?.monthlyOut).toBeGreaterThan(0);
    expect(on.forecast.layersUsed.at(-1)).toMatch(/^Projection: average of /);
  });

  it('keeps each currency apart', async () => {
    const eur = await loadForecast(
      connector(),
      [],
      { horizon: '13w', currency: 'EUR' },
      'the demo',
      today
    );
    expect(eur.forecast.currency).toBe('EUR');
    // The demo has no euro bank account: the opening balance is unknown, not zero.
    expect(eur.forecast.opening.balance).toBeUndefined();
  });
});

describe('Bookie cash_flow_forecast tool', () => {
  it('returns the computed forecast with the layers it used', async () => {
    const planned: PlannedItem[] = [
      {
        id: '0f1c2d3e-0000-4000-8000-000000000001',
        description: 'Quarterly VAT',
        amount: 4_000,
        direction: 'out',
        currency: 'GBP',
        date: today,
        repeat: 'quarterly',
      },
    ];
    const json = JSON.parse(
      await runTool(connector(), 'cash_flow_forecast', '{"horizon":"6m"}', {
        plannedItems: async () => planned,
        sourceName: 'the demo',
      })
    );
    expect(json.currency).toBe('GBP');
    expect(json.layersUsed).toEqual([
      'Known: approved invoices and bills',
      'Planned (you entered this)',
    ]);
    expect(json.totals.plannedOut).toBe(8_000);
    expect(json.periods).toHaveLength(6);
    expect(json.layersNotUsed.join(' ')).toMatch(/Drafts/);
    expect(json.openingBalance.balance).toEqual(expect.any(Number));
  });
});
