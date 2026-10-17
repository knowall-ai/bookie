import { describe, expect, it } from 'vitest';
import {
  addMonths,
  asAtLabel,
  columnLabel,
  datePresets,
  financialYear,
  monthsTouched,
  rangeLabel,
  rangePresets,
  shiftRange,
} from './periods';
import { agedBucket, buildAgedReport } from './aged';
import { formatReportNumber, reportToCsv } from './format';
import { REPORTS, resolveReportParams } from './catalog';

describe('periods', () => {
  it('finds the financial year around a date', () => {
    expect(financialYear('2026-10-17', 31, 3)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
    expect(financialYear('2026-02-01', 31, 3)).toEqual({ from: '2025-04-01', to: '2026-03-31' });
    expect(financialYear('2026-10-17')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    // 30 June year end, leap-safe February end.
    expect(financialYear('2026-07-01', 30, 6)).toEqual({ from: '2026-07-01', to: '2027-06-30' });
    expect(financialYear('2024-01-10', 29, 2).to).toBe('2024-02-29');
  });

  it('clamps month arithmetic', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('builds Xero-style presets', () => {
    const presets = rangePresets('2026-10-17', 31, 3);
    const byKey = Object.fromEntries(presets.map((p) => [p.key, p]));
    expect(byKey['this-month']).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(byKey['last-month']).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(byKey['this-quarter']).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(byKey['this-fy']).toMatchObject({ from: '2026-04-01', to: '2027-03-31' });
    expect(byKey['last-fy']).toMatchObject({ from: '2025-04-01', to: '2026-03-31' });
    const dates = Object.fromEntries(datePresets('2026-10-17', 31, 3).map((p) => [p.key, p.date]));
    expect(dates['end-of-last-month']).toBe('2026-09-30');
    expect(dates['end-of-last-quarter']).toBe('2026-09-30');
    expect(dates['end-of-last-fy']).toBe('2026-03-31');
  });

  it('shifts comparison periods keeping month ends', () => {
    expect(shiftRange({ from: '2026-10-01', to: '2026-10-31' }, 'month', 1)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(shiftRange({ from: '2026-07-01', to: '2026-09-30' }, 'quarter', 1)).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
    expect(shiftRange({ from: '2026-10-01', to: '2026-10-17' }, 'year', 1)).toEqual({
      from: '2025-10-01',
      to: '2025-10-17',
    });
  });

  it('labels ranges and columns', () => {
    expect(rangeLabel({ from: '2026-04-01', to: '2026-10-17' })).toBe(
      '1 April 2026 to 17 October 2026'
    );
    expect(asAtLabel('2026-10-17')).toBe('As at 17 October 2026');
    expect(columnLabel({ from: '2026-10-01', to: '2026-10-31' })).toBe('Oct 2026');
    expect(columnLabel({ from: '2026-07-01', to: '2026-09-30' })).toBe('Jul–Sep 2026');
    expect(columnLabel({ from: '2026-10-17', to: '2026-10-17' })).toBe('17 Oct 2026');
    expect(monthsTouched({ from: '2026-01-15', to: '2026-03-02' })).toBe(3);
  });
});

describe('aged summary', () => {
  it('buckets by due date in calendar months', () => {
    const asAt = '2026-10-17';
    expect(agedBucket('2026-10-17', asAt)).toBe(0); // due today: current
    expect(agedBucket('2026-11-01', asAt)).toBe(0);
    expect(agedBucket('2026-10-02', asAt)).toBe(1); // < 1 Month
    expect(agedBucket('2026-09-30', asAt)).toBe(2); // 1 Month
    expect(agedBucket('2026-08-15', asAt)).toBe(3);
    expect(agedBucket('2026-07-01', asAt)).toBe(4);
    expect(agedBucket('2025-01-01', asAt)).toBe(5); // Older
    expect(agedBucket(undefined, asAt)).toBe(0);
  });

  it('groups by contact with a total row', () => {
    const report = buildAgedReport({
      id: 'aged-receivables',
      title: 'Aged Receivables Summary',
      subtitles: ['Contoso'],
      asAt: '2026-10-17',
      items: [
        { contactId: 'b', contactName: 'Northwind', dueDate: '2026-11-01', amount: 100 },
        { contactId: 'a', contactName: 'Fabrikam', dueDate: '2026-09-10', amount: 50.1 },
        { contactId: 'a', contactName: 'Fabrikam', dueDate: '2026-10-10', amount: 25.2 },
        { contactId: 'c', contactName: 'Zero Ltd', dueDate: '2026-10-10', amount: 0 },
      ],
    });
    expect(report.columns).toEqual([
      'Contact',
      'Current',
      '< 1 Month',
      '1 Month',
      '2 Months',
      '3 Months',
      'Older',
      'Total',
    ]);
    const rows = report.sections[0].rows;
    expect(rows.map((r) => r.cells[0])).toEqual(['Fabrikam', 'Northwind', 'Total']);
    expect(rows[0].cells).toEqual(['Fabrikam', 0, 25.2, 50.1, 0, 0, 0, 75.3]);
    expect(rows[2]).toMatchObject({
      kind: 'summary',
      cells: ['Total', 100, 25.2, 50.1, 0, 0, 0, 175.3],
    });
  });
});

describe('report formatting', () => {
  it('shows negatives in brackets', () => {
    expect(formatReportNumber(1234.5)).toBe('1,234.50');
    expect(formatReportNumber(-1234.5)).toBe('(1,234.50)');
    expect(formatReportNumber(-0.001)).toBe('0.00');
  });

  it('exports CSV with raw numbers and quoted text', () => {
    const csv = reportToCsv({
      id: 'profit-and-loss',
      title: 'Profit and Loss',
      subtitles: ['Contoso, Ltd'],
      columns: ['', 'Oct 2026'],
      sections: [
        { title: 'Income', rows: [{ kind: 'row', cells: ['Sales', 1200] }] },
        { rows: [{ kind: 'summary', cells: ['Net Profit', -50.5] }] },
      ],
      generatedAt: '',
    });
    expect(csv.split('\r\n')).toEqual([
      'Profit and Loss,',
      '"Contoso, Ltd",',
      ',',
      ',Oct 2026',
      'Income,',
      'Sales,1200.00',
      'Net Profit,-50.50',
      '',
    ]);
  });
});

describe('report params', () => {
  it('defaults like Xero and validates input', () => {
    const pl = REPORTS['profit-and-loss'];
    expect(resolveReportParams(pl, {}, '2026-10-17')).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      periods: 0,
      timeframe: 'month',
    });
    expect(
      resolveReportParams(
        pl,
        { from: '2026-12-31', to: '2026-01-01', periods: '40', timeframe: 'quarter' },
        '2026-10-17'
      )
    ).toEqual({ from: '2026-01-01', to: '2026-12-31', periods: 11, timeframe: 'quarter' });
    expect(resolveReportParams(pl, { from: 'nope' }, '2026-10-17').from).toBe('2026-10-01');
    expect(resolveReportParams(REPORTS['balance-sheet'], {}, '2026-10-17').date).toBe('2026-10-17');
    // No comparison on reports that don't offer it, and aged reports are always as at today.
    expect(
      resolveReportParams(REPORTS['trial-balance'], { periods: '3' }, '2026-10-17').periods
    ).toBe(0);
    expect(
      resolveReportParams(REPORTS['aged-receivables'], { date: '2020-01-01' }, '2026-10-17').date
    ).toBe('2026-10-17');
  });
});
