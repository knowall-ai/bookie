import { describe, expect, it } from 'vitest';
import {
  agedPeriodLabels,
  fromBcAged,
  fromBcStatement,
  fromBcTrialBalance,
  incomeIsCreditNegative,
  parseBcAmount,
  type BcStatementLine,
} from './reports';

// Shaped like GET .../incomeStatements (fictional values).
const income = (sales: number, cost: number, rent: number): BcStatementLine[] => [
  { lineNumber: 10000, display: 'Income', lineType: 'header', indentation: 0, netChange: 0 },
  {
    lineNumber: 20000,
    display: 'Income, Services',
    lineType: 'detail',
    indentation: 1,
    netChange: sales,
  },
  {
    lineNumber: 90000,
    display: 'Total Income',
    lineType: 'total',
    indentation: 0,
    netChange: sales,
  },
  { lineNumber: 100000, display: '', lineType: 'spacer', indentation: 0, netChange: 0 },
  {
    lineNumber: 110000,
    display: 'Cost of Goods Sold',
    lineType: 'header',
    indentation: 0,
    netChange: 0,
  },
  { lineNumber: 120000, display: 'Materials', lineType: 'detail', indentation: 1, netChange: cost },
  {
    lineNumber: 160000,
    display: 'Total Cost of Goods Sold',
    lineType: 'total',
    indentation: 0,
    netChange: cost,
  },
  { lineNumber: 170000, display: '', lineType: 'spacer', indentation: 0, netChange: 0 },
  {
    lineNumber: 180000,
    display: 'Gross Profit',
    lineType: 'total',
    indentation: 0,
    netChange: sales - cost,
  },
  { lineNumber: 190000, display: '', lineType: 'spacer', indentation: 0, netChange: 0 },
  { lineNumber: 200000, display: 'Expense', lineType: 'header', indentation: 0, netChange: rent },
  {
    lineNumber: 210000,
    display: 'Rent Expense',
    lineType: 'detail',
    indentation: 1,
    netChange: rent,
  },
  {
    lineNumber: 360000,
    display: 'Total Expense',
    lineType: 'total',
    indentation: 0,
    netChange: rent,
  },
  { lineNumber: 370000, display: '', lineType: 'spacer', indentation: 0, netChange: 0 },
  {
    lineNumber: 380000,
    display: 'Net Income',
    lineType: 'total',
    indentation: 0,
    netChange: sales - cost - rent,
  },
];

describe('BC statements', () => {
  it('maps header/detail/total/spacer into sections and summary rows', () => {
    const report = fromBcStatement({
      id: 'profit-and-loss',
      title: 'Income Statement',
      subtitles: ['CRONUS UK Ltd.', '1 October 2026 to 31 October 2026'],
      columns: ['Oct 2026', 'Sep 2026'],
      periods: [income(1000, 400, 100), income(800, 300, 100)],
      value: 'netChange',
    });
    expect(report.columns).toEqual(['', 'Oct 2026', 'Sep 2026']);
    expect(report.sections.map((s) => s.title)).toEqual([
      'Income',
      'Cost of Goods Sold',
      undefined,
      'Expense',
      undefined,
    ]);
    expect(report.sections[0].rows).toEqual([
      { kind: 'row', cells: ['Income, Services', 1000, 800] },
      { kind: 'summary', cells: ['Total Income', 1000, 800] },
    ]);
    expect(report.sections[4].rows).toEqual([{ kind: 'summary', cells: ['Net Income', 500, 400] }]);
  });

  it('flips a credit-negative income statement so income is positive', () => {
    const negative = income(-1000, 400, 100).map((l) =>
      l.lineType === 'total' && /Gross|Net/.test(l.display) ? { ...l, netChange: -l.netChange! } : l
    );
    expect(incomeIsCreditNegative([negative])).toBe(true);
    expect(incomeIsCreditNegative([income(1000, 400, 100)])).toBe(false);
    expect(incomeIsCreditNegative([income(0, 0, 0)])).toBe(false);
    const report = fromBcStatement({
      id: 'profit-and-loss',
      title: 'Income Statement',
      subtitles: [],
      columns: ['Oct 2026'],
      periods: [negative],
      value: 'netChange',
      flip: true,
    });
    expect(report.sections[0].rows[1].cells).toEqual(['Total Income', 1000]);
    expect(report.sections[1].rows[0].cells).toEqual(['Materials', -400]);
  });

  it('gives a less-indented total its own section (balance sheet)', () => {
    const lines: BcStatementLine[] = [
      { lineNumber: 1, display: 'Assets', lineType: 'header', indentation: 0, balance: 0 },
      { lineNumber: 2, display: 'Current Assets', lineType: 'header', indentation: 1, balance: 0 },
      { lineNumber: 3, display: 'Cash', lineType: 'detail', indentation: 2, balance: 50 },
      {
        lineNumber: 4,
        display: 'Total Current Assets',
        lineType: 'total',
        indentation: 1,
        balance: 50,
      },
      { lineNumber: 5, display: 'Total Assets', lineType: 'total', indentation: 0, balance: 50 },
    ];
    const report = fromBcStatement({
      id: 'balance-sheet',
      title: 'Balance Sheet',
      subtitles: [],
      columns: ['17 Oct 2026'],
      periods: [lines],
      value: 'balance',
    });
    expect(report.sections).toEqual([
      { title: 'Assets', rows: [] },
      {
        title: 'Current Assets',
        rows: [
          { kind: 'row', cells: ['Cash', 50] },
          { kind: 'summary', cells: ['Total Current Assets', 50] },
        ],
      },
      { title: undefined, rows: [{ kind: 'summary', cells: ['Total Assets', 50] }] },
    ]);
  });
});

describe('BC trial balance', () => {
  it('parses BC display amounts', () => {
    expect(parseBcAmount('44,850.00')).toBe(44850);
    expect(parseBcAmount('44.850,00')).toBe(44850);
    expect(parseBcAmount('-1,234.5')).toBe(-1234.5);
    expect(parseBcAmount('1,234')).toBe(1234);
    expect(parseBcAmount('')).toBe(0);
    expect(parseBcAmount(undefined)).toBe(0);
  });

  it('groups by top-level totalling and hides zero accounts', () => {
    const line = (
      number: string,
      accountType: string,
      display: string,
      debit = '',
      credit = ''
    ) => ({
      number,
      accountType,
      display,
      balanceAtDateDebit: debit,
      balanceAtDateCredit: credit,
      totalDebit: debit,
      totalCredit: credit,
    });
    const report = fromBcTrialBalance({
      title: 'Trial Balance',
      subtitles: [],
      lines: [
        line('10000', 'Heading', 'INCOME STATEMENT'),
        line('10001', 'Begin_x002D_Total', 'Income'),
        line('10100', 'Begin_x002D_Total', 'Sales of Goods'),
        line('10110', 'Posting', 'Sale of Finished Goods', '', '1,500.00'),
        line('10120', 'Posting', 'Sale of Raw Materials'),
        line('10190', 'End_x002D_Total', 'Total, Sales of Goods', '', '1,500.00'),
        line('10999', 'End_x002D_Total', 'Total Income', '', '1,500.00'),
        line('20001', 'Begin_x002D_Total', 'Assets'),
        line('20110', 'Posting', 'Cash', '1,500.00', ''),
        line('20999', 'End_x002D_Total', 'Total Assets', '1,500.00', ''),
        line('99999', 'Total', 'NET INCOME'),
      ],
    });
    expect(report.columns).toEqual(['Account', 'Debit', 'Credit', 'YTD Debit', 'YTD Credit']);
    expect(report.sections.map((s) => s.title)).toEqual(['Income', 'Assets', undefined]);
    expect(report.sections[0].rows).toEqual([
      {
        kind: 'row',
        cells: ['Sale of Finished Goods (10110)', 0, 1500, 0, 1500],
        accountId: '10110',
      },
      { kind: 'summary', cells: ['Total Income', 0, 1500, 0, 1500] },
    ]);
    expect(report.sections[2].rows[0].cells).toEqual(['Total', 1500, 1500, 1500, 1500]);
  });
});

describe('BC aged', () => {
  it('labels periods from the period length', () => {
    expect(agedPeriodLabels('30D', [])).toEqual(['1–30 days', '31–60 days', 'Over 60 days']);
    expect(agedPeriodLabels('1M', [])).toEqual(['< 1 month', '1–2 months', 'Over 2 months']);
    expect(agedPeriodLabels('odd', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps BC total line and drops zero-balance customers', () => {
    const blank = '00000000-0000-0000-0000-000000000000';
    const report = fromBcAged({
      id: 'aged-receivables',
      title: 'Aged Accounts Receivable',
      subtitles: [],
      party: 'Customer',
      lines: [
        {
          customerId: blank,
          name: 'Total',
          balanceDue: 300,
          currentAmount: 100,
          period1Amount: 200,
          period2Amount: 0,
          period3Amount: 0,
          periodLengthFilter: '30D',
        },
        {
          customerId: 'c2',
          name: 'Northwind',
          balanceDue: 200,
          currentAmount: 0,
          period1Amount: 200,
          period2Amount: 0,
          period3Amount: 0,
          period1Label: '09/17/26-10/17/26',
          periodLengthFilter: '30D',
        },
        {
          customerId: 'c1',
          name: 'Fabrikam',
          balanceDue: 100,
          currentAmount: 100,
          period1Amount: 0,
          period2Amount: 0,
          period3Amount: 0,
          period1Label: '09/17/26-10/17/26',
          periodLengthFilter: '30D',
        },
        {
          customerId: 'c3',
          name: 'Paid Up Ltd',
          balanceDue: 0,
          currentAmount: 0,
          period1Amount: 0,
          period2Amount: 0,
          period3Amount: 0,
          periodLengthFilter: '30D',
        },
      ],
    });
    expect(report.columns).toEqual([
      'Customer',
      'Current',
      '1–30 days',
      '31–60 days',
      'Over 60 days',
      'Total',
    ]);
    expect(report.sections[0].rows.map((r) => r.cells[0])).toEqual([
      'Fabrikam',
      'Northwind',
      'Total',
    ]);
    expect(report.sections[0].rows[2]).toEqual({
      kind: 'summary',
      cells: ['Total', 100, 200, 0, 0, 300],
    });
  });
});
