import { describe, expect, it } from 'vitest';
import { computeForecast } from './compute';
import { forecastRows, forecastToCsv } from './csv';

const forecast = (over: { drafts?: boolean; opening?: boolean } = {}) =>
  computeForecast({
    today: '2026-10-14',
    horizon: '6m',
    currency: 'GBP',
    includeDrafts: over.drafts,
    bankAccounts:
      over.opening === false ? [] : [{ id: 'a', name: 'Current', currency: 'GBP', balance: 1000 }],
    invoices: [
      {
        id: 'b1',
        type: 'purchase',
        number: 'BILL-1',
        contact: { id: 'c', name: 'Coho, "Packaging"' },
        date: '2026-10-01',
        dueDate: '2026-11-03',
        status: 'authorised',
        currency: 'GBP',
        subTotal: 100,
        totalTax: 20,
        total: 120,
        amountDue: 120,
        isOverdue: false,
      },
    ],
    planned: [],
    sourceName: 'Xero',
  });

describe('forecast CSV', () => {
  it('has a column per bucket plus a total, money out negative', () => {
    const csv = forecastToCsv(forecast()).split('\r\n');
    expect(csv[0]).toBe(
      'Cash flow forecast (GBP),Oct 2026,Nov 2026,Dec 2026,Jan 2027,Feb 2027,Mar 2027,Total'
    );
    expect(csv[1]).toBe('Opening balance,1000.00,1000.00,880.00,880.00,880.00,880.00,1000.00');
    expect(csv[3]).toBe('Known out,0.00,-120.00,0.00,0.00,0.00,0.00,-120.00');
    expect(csv.find((l) => l.startsWith('Closing balance'))).toBe(
      'Closing balance,1000.00,880.00,880.00,880.00,880.00,880.00,880.00'
    );
  });

  it('only includes rows for the layers that are on', () => {
    expect(forecastRows(forecast()).map((r) => r.key)).not.toContain('draftIn');
    expect(forecastRows(forecast({ drafts: true })).map((r) => r.key)).toContain('draftIn');
  });

  it('writes "Not available" instead of a balance it cannot know', () => {
    const csv = forecastToCsv(forecast({ opening: false }));
    expect(csv).toContain('Opening balance,Not available');
  });
});

it('exports the weighted pipeline row and its excluded opportunities only when enabled', () => {
  const opportunity = {
    id: 'opp-1',
    number: 'OPP-1',
    description: 'Contoso coffee',
    closed: false,
    status: 'in-progress' as const,
    estimatedValue: 1000,
    chanceOfSuccess: 25,
    estimatedClosingDate: '2026-11-03',
    currency: 'GBP',
  };
  const input = {
    today: '2026-10-14',
    horizon: '6m' as const,
    currency: 'GBP',
    sourceName: 'Business Central',
    bankAccounts: [],
    invoices: [],
    planned: [],
    opportunities: [opportunity, { ...opportunity, number: 'OPP-2', estimatedValue: undefined }],
  };
  expect(forecastToCsv(computeForecast(input))).not.toContain('Pipeline (weighted)');
  const csv = forecastToCsv(computeForecast({ ...input, includePipeline: true }));
  expect(csv).toContain('Pipeline (weighted),0.00,250.00,0.00,0.00,0.00,0.00,250.00');
  expect(csv).toContain('Pipeline: open opportunities × chance of success');
  expect(csv).toContain(
    'Not in the pipeline: OPP-2 Contoso coffee: No estimated value in Business Central'
  );
});
