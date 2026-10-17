import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BcClient } from './client';
import {
  BC_BILL_PAYMENT_NOTE,
  billAmountDue,
  bookieExtension,
  clearBookieExtensionCache,
  DETECT_TTL_MS,
  extensionBankTransactions,
  extensionBillRemaining,
  extensionCacheKey,
  extensionPayments,
  extensionRegisterPayment,
  fromBcBankLedgerEntry,
  fromBcCompanySetup,
  fromBcFinancialReportLines,
  fromBcPostedPayment,
  toBcPaymentRegistration,
  withBankBalance,
  type BcBankLedgerEntry,
  type BcFinancialReportLine,
  type BcVendorLedgerEntry,
} from './extension';
import { fromPurchaseInvoice, type BcPurchaseInvoice } from './index';
import { bcPayments } from './modules/payments';

/* Fixtures are shaped like the extension's API responses, with fictional values. */

const COMPANY = '11111111-2222-3333-4444-555555555555';
const INVOICE = 'aaaaaaaa-0000-4000-8000-000000000001';
const BANK = 'bbbbbbbb-0000-4000-8000-000000000002';
const CUSTOMER = 'cccccccc-0000-4000-8000-000000000003';

function client(companyId = COMPANY, environment = 'Sandbox', tenantId = 'tenant-a') {
  return new BcClient({ tenantId, environment, companyId, token: async () => 'token' });
}

type Route = (url: URL, init: RequestInit) => Response | undefined;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const notFound = () =>
  json({ error: { code: 'BadRequest_NotFound', message: 'No HTTP resource was found.' } }, 404);

let routes: Route[] = [];
const fetchMock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  for (const route of routes) {
    const response = route(url, init);
    if (response) return response;
  }
  return notFound();
});

/** Calls made to the extension's API, by entity set. */
const extensionCalls = (entity: string) =>
  fetchMock.mock.calls.filter(
    ([input]) =>
      String(input).includes(`/api/knowallBookie/bookie/v1.0/companies(`) &&
      String(input).includes(`/${entity}`)
  );

const installed =
  (setup: Record<string, unknown> = {}): Route =>
  (url) =>
    url.pathname.endsWith('/companySetup')
      ? json({ value: [{ lcyCode: 'GBP', fiscalYearStartDate: '2026-04-01', ...setup }] })
      : undefined;

beforeEach(() => {
  clearBookieExtensionCache();
  routes = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bc extension detection', () => {
  it('calls companySetup on the extension route and maps it', async () => {
    routes = [
      installed({
        extensionVersion: '1.0.0.0',
        fiscalYearEndDate: '2027-03-31',
        countryRegionCode: 'GB',
        vatRegistrationNumber: '',
        incomeStatementReport: 'I/S',
      }),
    ];
    const ext = await bookieExtension(client());
    expect(ext).toEqual({
      version: '1.0.0.0',
      lcyCode: 'GBP',
      fiscalYearStart: '2026-04-01',
      fiscalYearEnd: '2027-03-31',
      country: 'GB',
      vatNumber: undefined,
      incomeStatementReport: 'I/S',
      balanceSheetReport: undefined,
    });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://api.businesscentral.dynamics.com/v2.0/tenant-a/Sandbox/api/knowallBookie/bookie/v1.0/companies(${COMPANY})/companySetup`
    );
  });

  it('treats a 404 as not installed and caches it', async () => {
    expect(await bookieExtension(client())).toBeUndefined();
    expect(await bookieExtension(client())).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('treats a 403 (no BOOKIE READ) as not installed', async () => {
    routes = [() => json({ error: { message: 'No permission' } }, 403)];
    expect(await bookieExtension(client())).toBeUndefined();
    await bookieExtension(client());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache sign-in failures or server errors', async () => {
    routes = [() => json({}, 500)];
    expect(await bookieExtension(client())).toBeUndefined();
    routes = [installed()];
    expect(await bookieExtension(client())).toMatchObject({ lcyCode: 'GBP' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches per tenant, environment and company for 10 minutes', async () => {
    routes = [installed()];
    const now = 1_000_000;
    await bookieExtension(client(), now);
    await bookieExtension(client(), now + 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await bookieExtension(client('99999999-2222-3333-4444-555555555555'), now);
    await bookieExtension(client(COMPANY, 'Production'), now);
    await bookieExtension(client(COMPANY, 'Sandbox', 'tenant-b'), now);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await bookieExtension(client(), now + DETECT_TTL_MS + 1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('shares one request between concurrent callers', async () => {
    routes = [installed()];
    await Promise.all([bookieExtension(client()), bookieExtension(client())]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keys the cache case-insensitively on environment and company', () => {
    expect(extensionCacheKey(client(COMPANY.toUpperCase(), 'SANDBOX'))).toBe(
      extensionCacheKey(client())
    );
  });

  it('maps blank setup values and BC empty dates to undefined', () => {
    expect(
      fromBcCompanySetup({ lcyCode: '', fiscalYearStartDate: '0001-01-01', extensionVersion: '' })
    ).toEqual({
      version: undefined,
      lcyCode: undefined,
      fiscalYearStart: undefined,
      fiscalYearEnd: undefined,
      country: undefined,
      vatNumber: undefined,
      incomeStatementReport: undefined,
      balanceSheetReport: undefined,
    });
  });
});

describe('bc extension bank', () => {
  const account = {
    id: BANK,
    name: 'Contoso Current',
    code: 'B010',
    currency: 'GBP',
    type: 'bank' as const,
  };

  it('adds balance, statement and unreconciled count', () => {
    expect(
      withBankBalance(account, {
        id: BANK,
        number: 'B010',
        balance: 1250.5,
        lastStatementNumber: '42',
        lastStatementBalance: 1100,
        lastStatementDate: '2026-09-30',
        unreconciledEntries: 3,
      })
    ).toEqual({
      ...account,
      balance: 1250.5,
      statementBalance: 1100,
      statementDate: '2026-09-30',
      unreconciledCount: 3,
    });
  });

  it('leaves the statement balance unknown when no statement was posted', () => {
    const result = withBankBalance(account, {
      id: BANK,
      number: 'B010',
      balance: 10,
      lastStatementNumber: '',
      lastStatementBalance: 0,
      lastStatementDate: '0001-01-01',
      unreconciledEntries: 0,
    });
    expect(result.statementBalance).toBeUndefined();
    expect(result.statementDate).toBeUndefined();
    expect(result.unreconciledCount).toBe(0);
  });

  const entry = (overrides: Partial<BcBankLedgerEntry>): BcBankLedgerEntry => ({
    id: 'e1',
    entryNumber: 7,
    bankAccountNumber: 'B010',
    postingDate: '2026-10-01',
    documentNumber: 'PMT-0001',
    externalDocumentNumber: '',
    description: 'Fabrikam Ltd',
    amount: 120,
    currencyCode: '',
    open: true,
    balAccountType: 'G_x002F_L_x0020_Account',
    reversed: false,
    ...overrides,
  });

  it('maps ledger entries to receive, spend and transfers', () => {
    const acc = { id: BANK, name: 'Contoso Current', currency: 'GBP' };
    expect(fromBcBankLedgerEntry(entry({}), acc)).toEqual({
      id: 'e1',
      bankAccountId: BANK,
      bankAccountName: 'Contoso Current',
      date: '2026-10-01',
      type: 'receive',
      reference: 'PMT-0001',
      description: 'Fabrikam Ltd',
      amount: 120,
      currency: 'GBP',
      isReconciled: false,
      status: 'authorised',
    });
    expect(fromBcBankLedgerEntry(entry({ amount: -80, open: false }), acc)).toMatchObject({
      type: 'spend',
      amount: 80,
      isReconciled: true,
    });
    expect(
      fromBcBankLedgerEntry(entry({ amount: -5, balAccountType: 'Bank_x0020_Account' }), acc).type
    ).toBe('transfer-out');
    expect(fromBcBankLedgerEntry(entry({ balAccountType: 'Bank_x0020_Account' }), acc).type).toBe(
      'transfer-in'
    );
    expect(
      fromBcBankLedgerEntry(entry({ reversed: true, externalDocumentNumber: 'REF-9' }), acc)
    ).toMatchObject({ status: 'deleted', reference: 'REF-9' });
  });

  it('lists one account newest first with filters, or undefined without the extension', async () => {
    expect(
      await extensionBankTransactions(client(), BANK, undefined, async () => 'GBP')
    ).toBeUndefined();

    clearBookieExtensionCache();
    routes = [
      installed(),
      (url) =>
        url.pathname.endsWith(`/bankAccounts(${BANK})`)
          ? json({ number: "B'010", displayName: 'Contoso Current', currencyCode: '' })
          : undefined,
      (url) =>
        url.pathname.endsWith('/bankAccountLedgerEntries')
          ? json({ value: [entry({}), entry({ id: 'e2', amount: -3 }), entry({ id: 'e3' })] })
          : undefined,
    ];
    const page = await extensionBankTransactions(
      client(),
      BANK,
      { page: 1, pageSize: 2, from: '2026-01-01', to: '2026-12-31' },
      async () => 'GBP'
    );
    expect(page?.items.map((t) => t.id)).toEqual(['e1', 'e2']);
    expect(page?.hasMore).toBe(true);
    const [url] = extensionCalls('bankAccountLedgerEntries')[0];
    const params = new URL(String(url)).searchParams;
    expect(params.get('$filter')).toBe(
      "bankAccountNumber eq 'B''010' and postingDate ge 2026-01-01 and postingDate le 2026-12-31"
    );
    expect(params.get('$orderby')).toBe('postingDate desc,entryNumber desc');
    expect(params.get('$top')).toBe('3');
  });

  it('rejects ids that are not GUIDs', async () => {
    routes = [installed()];
    await expect(
      extensionBankTransactions(client(), "x') or (1 eq 1", undefined, async () => 'GBP')
    ).rejects.toThrow('Unknown bank account id.');
  });
});

describe('bc extension bills', () => {
  const vle = (overrides: Partial<BcVendorLedgerEntry>): BcVendorLedgerEntry => ({
    id: 'v1',
    entryNumber: 1,
    vendorNumber: 'V0001',
    documentType: 'Invoice',
    documentNumber: 'PI-1001',
    remainingAmount: -40,
    open: true,
    ...overrides,
  });

  it('takes the amount due from the single matching vendor ledger entry', () => {
    expect(billAmountDue([vle({})])).toBe(40);
    expect(
      billAmountDue([vle({}), vle({ vendorNumber: 'V0002', remainingAmount: -9 })], 'V0002')
    ).toBe(9);
    expect(billAmountDue([vle({}), vle({ entryNumber: 2 })], 'V0001')).toBeUndefined();
    expect(billAmountDue([])).toBeUndefined();
    expect(billAmountDue(undefined)).toBeUndefined();
  });

  const bill: BcPurchaseInvoice = {
    id: 'p1',
    number: 'PI-1001',
    invoiceDate: '2026-09-01',
    dueDate: '2026-10-01',
    vendorId: 'vend-1',
    vendorNumber: 'V0001',
    vendorName: 'Northwind Traders',
    status: 'Open',
    totalAmountIncludingTax: 100,
  };

  it('uses the remaining amount on posted bills, and unknown (never the total) without it', () => {
    expect(fromPurchaseInvoice(bill, 'GBP', 40)).toMatchObject({
      amountDue: 40,
      amountPaid: 60,
    });
    const unknown = fromPurchaseInvoice(bill, 'GBP');
    expect(unknown.amountDue).toBeUndefined();
    expect(unknown.amountPaid).toBeUndefined();
    expect(fromPurchaseInvoice({ ...bill, status: 'Draft' }, 'GBP', 40).amountDue).toBe(100);
    expect(fromPurchaseInvoice({ ...bill, status: 'Paid' }, 'GBP', 40).amountDue).toBe(0);
  });

  it('looks up bill numbers in batches with an OR filter on one field', async () => {
    routes = [
      installed(),
      (url) =>
        url.pathname.endsWith('/vendorLedgerEntries')
          ? json({ value: [vle({}), vle({ id: 'v2', documentNumber: 'PI-1002' })] })
          : undefined,
    ];
    const numbers = Array.from({ length: 16 }, (_, i) => `PI-${1001 + i}`);
    const byNumber = await extensionBillRemaining(client(), [...numbers, 'PI-1001', '']);
    const calls = extensionCalls('vendorLedgerEntries');
    expect(calls).toHaveLength(2);
    const filter = new URL(String(calls[0][0])).searchParams.get('$filter');
    expect(filter).toMatch(
      /^documentType eq 'Invoice' and \(documentNumber eq 'PI-1001' or documentNumber eq 'PI-1002' or /
    );
    expect(byNumber?.get('PI-1001')).toHaveLength(2);
  });

  it('returns undefined without the extension or with nothing to look up', async () => {
    expect(await extensionBillRemaining(client(), ['PI-1'])).toBeUndefined();
    expect(await extensionBillRemaining(client(), [])).toBeUndefined();
  });
});

describe('bc extension payments', () => {
  it('maps a posted payment application', () => {
    expect(
      fromBcPostedPayment(
        {
          id: 'd1',
          entryNumber: 12,
          postingDate: '2026-10-02',
          paymentNumber: 'PMT-0004',
          externalDocumentNumber: '',
          customerNumber: 'C0001',
          customerId: CUSTOMER,
          customerName: 'Fabrikam Ltd',
          currencyCode: '',
          amount: 250,
          invoiceNumber: 'SI-2001',
          invoiceId: INVOICE,
          bankAccountNumber: 'B010',
          bankAccountId: BANK,
        },
        'sales',
        'GBP',
        new Map([[BANK, 'Contoso Current']])
      )
    ).toEqual({
      id: 'd1',
      date: '2026-10-02',
      amount: 250,
      currency: 'GBP',
      reference: 'PMT-0004',
      invoiceId: INVOICE,
      invoiceNumber: 'SI-2001',
      invoiceType: 'sales',
      contact: { id: `c:${CUSTOMER}`, name: 'Fabrikam Ltd' },
      bankAccountId: BANK,
      bankAccountName: 'Contoso Current',
      status: 'authorised',
    });
  });

  it('leaves the bank and invoice unknown when BC has none', () => {
    const payment = fromBcPostedPayment(
      {
        id: 'd2',
        entryNumber: 13,
        postingDate: '2026-10-02',
        paymentNumber: 'PMT-0005',
        vendorId: '00000000-0000-0000-0000-000000000000',
        amount: 10,
        invoiceId: '00000000-0000-0000-0000-000000000000',
        bankAccountId: '00000000-0000-0000-0000-000000000000',
      },
      'purchase',
      'USD'
    );
    expect(payment).toMatchObject({ invoiceId: undefined, bankAccountId: undefined });
    expect(payment.contact).toBeUndefined();
    expect(payment.bankAccountName).toBeUndefined();
  });

  it('lists posted payments from both ledgers, newest first', async () => {
    const posted = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
      id,
      entryNumber: 1,
      postingDate: date,
      paymentNumber: id.toUpperCase(),
      amount: 5,
      ...extra,
    });
    routes = [
      installed(),
      (url) => (url.pathname.endsWith('/bankAccounts') ? json({ value: [] }) : undefined),
      (url) =>
        url.pathname.endsWith('/postedCustomerPayments')
          ? json({ value: [posted('s1', '2026-10-05'), posted('s2', '2026-09-01')] })
          : undefined,
      (url) =>
        url.pathname.endsWith('/postedVendorPayments')
          ? json({ value: [posted('p1', '2026-10-01')] })
          : undefined,
    ];
    const page = await extensionPayments(client(), { page: 1, pageSize: 2 }, async () => 'GBP');
    expect(page?.items.map((p) => [p.id, p.invoiceType])).toEqual([
      ['s1', 'sales'],
      ['p1', 'purchase'],
    ]);
    expect(page?.hasMore).toBe(true);
  });

  it('validates the registration request', () => {
    expect(
      toBcPaymentRegistration({
        invoiceId: INVOICE,
        bankAccountId: BANK,
        date: '2026-10-17',
        amount: 120,
        reference: '  REF-1 ',
      })
    ).toEqual({
      invoiceId: INVOICE,
      bankAccountId: BANK,
      paymentDate: '2026-10-17',
      amount: 120,
      externalDocumentNumber: 'REF-1',
    });
    expect(() =>
      toBcPaymentRegistration({
        invoiceId: 'nope',
        bankAccountId: BANK,
        date: '2026-10-17',
        amount: 1,
      })
    ).toThrow('Unknown invoice id.');
    expect(() =>
      toBcPaymentRegistration({
        invoiceId: INVOICE,
        bankAccountId: BANK,
        date: '2026-10-17',
        amount: 1,
        reference: 'x'.repeat(36),
      })
    ).toThrow('at most 35 characters');
  });

  it('registers a customer payment through paymentRegistrations', async () => {
    routes = [
      installed(),
      (url) =>
        url.pathname.endsWith(`/salesInvoices(${INVOICE})`)
          ? json({ id: INVOICE, customerId: CUSTOMER, customerName: 'Fabrikam Ltd' })
          : undefined,
      (url, init) =>
        url.pathname.endsWith('/paymentRegistrations') && init.method === 'POST'
          ? json(
              {
                id: 'r1',
                invoiceId: INVOICE,
                invoiceNumber: 'SI-2001',
                bankAccountId: BANK,
                bankAccountNumber: 'B010',
                paymentDate: '2026-10-17',
                amount: 120,
                externalDocumentNumber: '',
                customerNumber: 'C0001',
                documentNumber: 'PMT-0009',
                paymentLedgerEntryNumber: 99,
                invoiceRemainingAmount: 30,
                invoiceClosed: false,
              },
              201
            )
          : undefined,
    ];
    const payment = await extensionRegisterPayment(
      client(),
      { invoiceId: INVOICE, bankAccountId: BANK, date: '2026-10-17', amount: 120 },
      async () => 'GBP'
    );
    expect(payment).toMatchObject({
      id: 'r1',
      amount: 120,
      currency: 'GBP',
      reference: 'PMT-0009',
      invoiceId: INVOICE,
      invoiceType: 'sales',
      contact: { id: `c:${CUSTOMER}`, name: 'Fabrikam Ltd' },
      bankAccountId: BANK,
    });
    const [, init] = extensionCalls('paymentRegistrations')[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      invoiceId: INVOICE,
      bankAccountId: BANK,
      paymentDate: '2026-10-17',
      amount: 120,
    });
  });

  it('refuses bills (not a sales invoice) before posting anything', async () => {
    routes = [installed()];
    await expect(
      extensionRegisterPayment(
        client(),
        { invoiceId: INVOICE, bankAccountId: BANK, date: '2026-10-17', amount: 1 },
        async () => 'GBP'
      )
    ).rejects.toThrow(BC_BILL_PAYMENT_NOTE);
    expect(extensionCalls('paymentRegistrations')).toHaveLength(0);
  });

  it('only offers payment create when the extension is installed, for invoices', () => {
    const lcy = async () => 'GBP';
    expect(bcPayments(client(), lcy)?.create).toBeUndefined();
    const withExtension = bcPayments(client(), lcy, { lcyCode: 'GBP' });
    expect(withExtension?.create).toBeTypeOf('function');
    expect(withExtension?.createFor).toEqual(['sales']);
  });
});

describe('bc extension financial reports', () => {
  const line = (overrides: Partial<BcFinancialReportLine>): BcFinancialReportLine => ({
    id: 'l',
    rowDefinition: 'I/S',
    lineNumber: 10000,
    rowNumber: 'R10',
    description: 'Revenue',
    totalingType: 'Posting_x0020_Accounts',
    show: 'Yes',
    indentation: 1,
    bold: false,
    netChange: 500,
    balanceAtDate: 900,
    ...overrides,
  });

  it('keeps BC order and its Show rules', () => {
    const rows = fromBcFinancialReportLines([
      line({ lineNumber: 30000, description: 'Net income', totalingType: 'Formula', bold: true }),
      line({ lineNumber: 10000 }),
      line({ lineNumber: 20000, description: 'Hidden', show: 'No' }),
      line({
        lineNumber: 25000,
        description: 'Zero',
        show: 'If_x0020_Any_x0020_Column_x0020_Not_x0020_Zero',
        netChange: 0,
      }),
      line({
        lineNumber: 26000,
        description: 'Negative only',
        show: 'When_x0020_Negative_x0020_Balance',
        netChange: -2,
      }),
    ]);
    expect(rows.map((r) => [r.description, r.isTotal, r.bold])).toEqual([
      ['Revenue', false, false],
      ['Negative only', false, false],
      ['Net income', true, true],
    ]);
    expect(rows[0]).toMatchObject({
      netChange: 500,
      balanceAtDate: 900,
      indentation: 1,
      rowNumber: 'R10',
    });
  });
});
