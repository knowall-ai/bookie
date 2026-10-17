import { describe, expect, it } from 'vitest';
import type { OrgRef } from '@/lib/domain/types';
import type { BcClient } from './client';
import {
  BC_BILL_REMAINING_NOTE,
  createBcConnector,
  fromParty,
  fromPurchaseInvoice,
  fromSalesInvoice,
  incomeFromStatement,
  vendorRemaining,
  type BcPurchaseInvoice,
  type BcSalesInvoice,
} from './index';
import { BC_FY_NOT_SET_UP, fiscalYearStartFrom } from './fiscal-year';
import { fromBcTrialBalance } from './modules/reports';

/* Fixtures are shaped like BC API v2.0 responses, with fictional values. */

const bill = (over: Partial<BcPurchaseInvoice> = {}): BcPurchaseInvoice => ({
  id: 'b1',
  number: 'PI-1001',
  invoiceDate: '2026-09-01',
  dueDate: '2026-09-30',
  vendorId: 'v1',
  vendorName: 'Trey Research',
  currencyCode: '',
  status: 'Open',
  totalAmountExcludingTax: 100,
  totalTaxAmount: 20,
  totalAmountIncludingTax: 120,
  ...over,
});

const sale = (over: Partial<BcSalesInvoice> = {}): BcSalesInvoice => ({
  id: 's1',
  number: 'SI-1001',
  invoiceDate: '2026-09-01',
  dueDate: '2026-09-30',
  customerId: 'c1',
  customerName: 'Fabrikam',
  currencyCode: 'GBP',
  status: 'Open',
  totalAmountIncludingTax: 120,
  remainingAmount: 20,
  ...over,
});

describe('bc purchase invoices: no assumed remaining amount', () => {
  it('leaves amount due and paid unknown on an open bill (not "fully unpaid")', () => {
    const invoice = fromPurchaseInvoice(bill(), 'GBP');
    expect(invoice.amountDue).toBeUndefined();
    expect(invoice.amountPaid).toBeUndefined();
    expect(invoice.status).toBe('authorised');
    // Open and past its due date is overdue: that much BC does say.
    expect(invoice.isOverdue).toBe(true);
  });

  it('knows unposted and paid bills from their status', () => {
    expect(fromPurchaseInvoice(bill({ status: 'Draft' }), 'GBP')).toMatchObject({
      amountDue: 120,
      amountPaid: 0,
    });
    expect(fromPurchaseInvoice(bill({ status: 'Paid' }), 'GBP')).toMatchObject({
      amountDue: 0,
      amountPaid: 120,
    });
  });

  it('uses the remaining amount when the BC extension hook provides one', () => {
    expect(vendorRemaining(bill())).toBeUndefined();
    expect(fromPurchaseInvoice(bill(), 'GBP', 45)).toMatchObject({
      amountDue: 45,
      amountPaid: 75,
    });
  });

  it('never defaults a sales invoice remaining amount to 0', () => {
    expect(fromSalesInvoice(sale(), 'GBP')).toMatchObject({ amountDue: 20, amountPaid: 100 });
    const missing = fromSalesInvoice(sale({ remainingAmount: undefined }), 'GBP');
    expect(missing.amountDue).toBeUndefined();
    expect(missing.amountPaid).toBeUndefined();
  });
});

describe('bc vendors: no estimated overdue', () => {
  it('reports the vendor balance but no overdue figure', () => {
    const vendor = fromParty(
      { id: 'v1', number: 'V0001', displayName: 'Trey Research', balance: 300 },
      'vendors'
    );
    expect(vendor.balances?.payable).toBe(300);
    expect(vendor.balances?.overduePayable).toBeUndefined();
  });

  it('keeps a missing balance unknown rather than 0', () => {
    const customer = fromParty({ id: 'c1', number: 'C0001', displayName: 'Fabrikam' }, 'customers');
    expect(customer.balances?.receivable).toBeUndefined();
  });
});

describe('bc financial year', () => {
  it('takes the latest new-fiscal-year period that starts on or before the date', () => {
    const periods = [
      { startingDate: '2024-04-01', newFiscalYear: true },
      { startingDate: '2025-04-01', newFiscalYear: true },
      { startingDate: '2026-04-01', newFiscalYear: true },
      { startingDate: '2027-04-01', newFiscalYear: true },
    ];
    expect(fiscalYearStartFrom(periods, '2026-10-17')).toBe('2026-04-01');
    expect(fiscalYearStartFrom(periods, '2026-03-31')).toBe('2025-04-01');
  });

  it('has no start (never 1 January) when no periods are set up', () => {
    expect(fiscalYearStartFrom([], '2026-10-17')).toBeUndefined();
  });

  it('drops the YTD trial balance columns without a financial year', () => {
    const report = fromBcTrialBalance({
      title: 'Trial Balance',
      subtitles: [],
      ytd: false,
      note: 'No FY',
      lines: [
        {
          number: '10100',
          display: 'Bank',
          accountType: 'Posting',
          balanceAtDateDebit: '1,000.00',
          balanceAtDateCredit: '0.00',
          totalDebit: '5.00',
          totalCredit: '0.00',
        },
      ],
    });
    expect(report.columns).toEqual(['Account', 'Debit', 'Credit']);
    expect(report.sections[0].rows[0].cells).toEqual(['Bank (10100)', 1000, 0]);
    expect(report.note).toBe('No FY');
  });
});

describe('bc income statement', () => {
  it('reads income and net from the statement lines', () => {
    expect(
      incomeFromStatement([
        { display: 'Total Income', lineType: 'total', netChange: 500 },
        { display: 'Net Income', lineType: 'total', netChange: 200 },
      ])
    ).toEqual({ income: 500, expenses: 300, net: 200 });
  });

  it('is undefined, not zero, when the lines are missing', () => {
    expect(
      incomeFromStatement([{ display: 'Something else', lineType: 'total', netChange: 1 }])
    ).toBeUndefined();
  });
});

/** A fake BC client answering GETs from fixtures keyed by entity. */
function fakeBc(responses: Record<string, unknown[]>): BcClient {
  const rows = (path: string) => responses[path.split('?')[0]] ?? [];
  return {
    tenantId: 't',
    environment: 'Sandbox',
    request: async (path: string) => ({ value: rows(path) }),
    all: async (path: string) => rows(path),
  } as unknown as BcClient;
}

const ORG: OrgRef = {
  key: 'bc.Sandbox.x',
  kind: 'business-central',
  name: 'CRONUS',
  sourceLabel: 'Business Central · Sandbox',
  // The environment's country must never be turned into a currency.
  country: 'GB',
};

describe('bc connector: currency and dashboard without guesses', () => {
  it("doesn't infer the base currency from the country", async () => {
    const connector = createBcConnector({
      org: ORG,
      companyName: 'CRONUS',
      client: fakeBc({ companyInformation: [{ displayName: 'CRONUS', country: 'GB' }] }),
    });
    const details = await connector.organisation();
    expect(details.baseCurrency).toBeUndefined();
  });

  it('counts open bills without inventing their total, and omits the FY tile without a FY', async () => {
    const connector = createBcConnector({
      org: ORG,
      companyName: 'CRONUS',
      client: fakeBc({
        companyInformation: [{ displayName: 'CRONUS', currencyCode: 'GBP' }],
        accountingPeriods: [],
        purchaseInvoices: [bill(), bill({ id: 'b2', status: 'Draft' })],
        salesInvoices: [sale()],
        incomeStatements: [
          { display: 'Total Income', lineType: 'total', netChange: 10 },
          { display: 'Net Income', lineType: 'total', netChange: 4 },
        ],
        bankAccounts: [],
      }),
    });
    const d = await connector.dashboard();
    expect(d.currency).toBe('GBP');
    expect(d.payables.awaitingPayment).toMatchObject({ count: 1, unknownCount: 1 });
    expect(d.payables.awaitingPayment.total).toBeUndefined();
    expect(d.payables.overdue.total).toBeUndefined();
    expect(d.payables.draft).toMatchObject({ count: 1, total: 120 });
    expect(d.notes?.payables).toBe(BC_BILL_REMAINING_NOTE);
    expect(d.receivables.awaitingPayment).toMatchObject({ count: 1, total: 20 });
    expect(d.profitAndLoss).toBeUndefined();
    expect(d.notes?.profitAndLoss).toBe(BC_FY_NOT_SET_UP);
    expect(d.trend).toHaveLength(12);
  });
});
