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

describe('pipeline loading', () => {
  it('does not fetch opportunities unless requested and exposes availability', async () => {
    const c = connector();
    let calls = 0;
    c.opportunities = {
      list: async () => {
        calls++;
        return { items: [], page: 1, pageSize: 200, hasMore: false };
      },
    };
    const off = await loadForecast(c, [], { horizon: '6m' }, 'Demo', today);
    expect(off.pipeline.available).toBe(true);
    expect(calls).toBe(0);
    c.opportunities = undefined;
    const unavailable = await loadForecast(
      c,
      [],
      { horizon: '6m', includePipeline: true },
      'Xero',
      today
    );
    expect(unavailable.pipeline).toEqual({
      available: false,
      reason: "Xero has no sales opportunities, so there's no pipeline to add.",
    });
    expect(unavailable.forecast.layers.pipeline).toBe(false);
  });

  it('reads every page of open opportunities and preserves exclusions and notes', async () => {
    const c = connector();
    const pages: number[] = [];
    c.opportunities = {
      list: async (options) => {
        expect(options).toMatchObject({ open: true, pageSize: 200 });
        const page = options!.page!;
        pages.push(page);
        return {
          items: [
            {
              id: `opp-${page}`,
              number: `OPP-${page}`,
              description: 'Fabrikam',
              status: 'in-progress',
              closed: false,
              currency: 'GBP',
              estimatedValue: page === 1 ? 100 : undefined,
              chanceOfSuccess: 50,
              estimatedClosingDate: today,
            },
          ],
          page,
          pageSize: 200,
          hasMore: page === 1,
          note: 'Source note',
        };
      },
    };
    const result = await loadForecast(
      c,
      [],
      { horizon: '6m', includePipeline: true },
      'Business Central',
      today
    );
    expect(pages).toEqual([1, 2]);
    expect(result.forecast.totals.pipelineIn).toBe(50);
    expect(result.forecast.pipelineExcluded[0].reason).toBe(
      'No estimated value in Business Central'
    );
    expect(result.notes.filter((n) => n === 'Source note')).toHaveLength(1);
  });

  it('refuses a partial pipeline at the page limit', async () => {
    const c = connector();
    let calls = 0;
    c.opportunities = {
      list: async () => {
        calls++;
        return { items: [], page: calls, pageSize: 200, hasMore: true };
      },
    };
    await expect(
      loadForecast(c, [], { horizon: '6m', includePipeline: true }, 'Business Central', today)
    ).rejects.toThrow('more than 5,000 open opportunities');
    expect(calls).toBe(25);
  });

  it('exposes weighted pipeline and excluded reasons through Bookie', async () => {
    const json = JSON.parse(
      await runTool(connector(), 'cash_flow_forecast', '{"horizon":"6m","include_pipeline":true}', {
        sourceName: 'Demo',
      })
    );
    expect(json.totals.pipelineIn).toBeGreaterThan(0);
    expect(json.pipeline.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'No estimated closing date' }),
        expect.objectContaining({ reason: 'No estimated value in Demo' }),
      ])
    );
  });
});
