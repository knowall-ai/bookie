import { describe, expect, it } from 'vitest';
import type { XeroClient, XeroRequest } from '../client';
import {
  fromXeroBankTransaction,
  fromXeroPaymentAsTransaction,
  registerFilters,
  xeroBank,
  type XeroBankTransaction,
  type XeroPayment,
} from './bank';
import { fromXeroManualJournal, toXeroJournalStatusUpdate, xeroJournals } from './journals';
import type { XeroManualJournal } from './journals';
import {
  fromXeroJournalToLedger,
  journalsEnteredSince,
  lookbackStart,
  XERO_SOURCE_TYPES,
} from './ledger';
import type { XeroJournal } from './accounts';
import { fromXeroOrganisation, fromXeroUser, xeroUsers } from './organisation';

/* Fixtures are shaped like the Xero OpenAPI examples and live responses, with fictional values. */

const ACCOUNT = '5f1c2e9a-0b1d-4c55-9a7e-1f2b3c4d5e6f';
const CONTACT = '9d8c7b6a-5f4e-4d3c-8b2a-1a0b9c8d7e6f';

function fakeClient(respond: (path: string, request: XeroRequest) => unknown) {
  const calls: { path: string; request: XeroRequest }[] = [];
  const client = {
    async request(path: string, request: XeroRequest = {}) {
      calls.push({ path, request });
      return respond(path, request);
    },
  } as unknown as XeroClient;
  return { client, calls };
}

describe('xero account register filters', () => {
  it('builds where clauses for both endpoints with every filter', () => {
    const where = registerFilters(ACCOUNT, {
      from: '2026-07-01',
      to: '2026-09-30',
      reconciled: false,
      search: 'Rent "Q3"',
      contactId: CONTACT,
      direction: 'spent',
    });
    expect(where.transactions).toBe(
      `BankAccount.AccountID==guid("${ACCOUNT}") AND Status=="AUTHORISED" AND Date>=DateTime(2026,07,01) AND Date<=DateTime(2026,09,30) AND IsReconciled==false AND Reference!=null AND Reference.Contains("Rent \\"Q3\\"") AND Contact.ContactID==guid("${CONTACT}") AND (Type=="SPEND" OR Type=="SPEND-TRANSFER" OR Type=="SPEND-OVERPAYMENT" OR Type=="SPEND-PREPAYMENT")`
    );
    expect(where.payments).toContain(`Account.AccountID==guid("${ACCOUNT}")`);
    expect(where.payments).toContain(`Invoice.Contact.ContactID==guid("${CONTACT}")`);
    expect(where.payments).toContain('PaymentType=="ACCPAYPAYMENT"');
    expect(where.payments).not.toContain('ACCRECPAYMENT');
  });

  it('received picks the money-in types and payments', () => {
    const where = registerFilters(ACCOUNT, { direction: 'received', reconciled: true });
    expect(where.transactions).toContain('Type=="RECEIVE-TRANSFER"');
    expect(where.transactions).toContain('IsReconciled==true');
    expect(where.payments).toContain('PaymentType=="ACCRECPAYMENT"');
    expect(where.payments).toContain('PaymentType=="APCREDITPAYMENT"');
  });

  it('strips anything that is not a guid from ids', () => {
    const where = registerFilters('abc") OR (1==1', { contactId: 'a1")' });
    expect(where.transactions).toContain('guid("abc11")');
    expect(where.transactions).toContain('Contact.ContactID==guid("a1")');
  });

  it('passes the filters through to Xero and advertises them', async () => {
    const { client, calls } = fakeClient((path) =>
      path === 'BankTransactions'
        ? { BankTransactions: [], pagination: { itemCount: 0 } }
        : { Payments: [], pagination: { itemCount: 0 } }
    );
    const bank = xeroBank(client);
    await bank.transactions(ACCOUNT, { direction: 'received', page: 1, pageSize: 50 });
    expect(calls.map((c) => c.path).sort()).toEqual(['BankTransactions', 'Payments']);
    expect(String(calls[0].request.query?.where)).toContain('RECEIVE');
    expect(bank.filters).toEqual({ direction: true, reconciled: true, contact: true });
    expect(bank.limitations).toMatch(/statement lines/);
  });
});

describe('xero register entries', () => {
  const spend: XeroBankTransaction = {
    BankTransactionID: 'bt-1',
    Type: 'SPEND',
    Contact: { ContactID: CONTACT, Name: 'Northwind Traders' },
    BankAccount: { AccountID: ACCOUNT, Code: '090', Name: 'Business Current Account' },
    DateString: '2026-09-14T00:00:00',
    Reference: 'INV-0042',
    LineAmountTypes: 'Inclusive',
    SubTotal: 100,
    TotalTax: 20,
    Total: 120,
    CurrencyCode: 'GBP',
    IsReconciled: true,
    HasAttachments: true,
    Status: 'AUTHORISED',
    UpdatedDateUTC: '/Date(1789000000000+0000)/',
    LineItems: [
      {
        Description: 'Office chairs',
        Quantity: 2,
        UnitAmount: 60,
        AccountCode: '710',
        TaxType: 'INPUT2',
        TaxAmount: 20,
        LineAmount: 120,
      },
    ],
  };

  it('maps spend money with its coding, totals and attachments flag', () => {
    expect(fromXeroBankTransaction(spend)).toMatchObject({
      id: 'bt-1',
      source: 'bank-transaction',
      type: 'spend',
      date: '2026-09-14',
      amount: 120,
      subTotal: 100,
      totalTax: 20,
      lineAmountType: 'inclusive',
      hasAttachments: true,
      isReconciled: true,
      updatedAt: '2026-09-10T00:26:40.000Z',
      lineItems: [{ accountCode: '710', taxType: 'INPUT2', lineAmount: 120 }],
    });
  });

  it('maps a batch payment against a bill, with the bill as its document', () => {
    const payment: XeroPayment = {
      PaymentID: 'p-1',
      PaymentType: 'ACCPAYPAYMENT',
      Date: '/Date(1788998400000+0000)/',
      Amount: 480,
      Reference: 'Batch Oct',
      IsReconciled: false,
      Status: 'AUTHORISED',
      Account: { AccountID: ACCOUNT, Code: '090' },
      BatchPaymentID: 'b-77',
      Invoice: {
        InvoiceID: 'inv-9',
        InvoiceNumber: 'FAB-118',
        Type: 'ACCPAY',
        CurrencyCode: 'GBP',
        Contact: { ContactID: CONTACT, Name: 'Fabrikam Supplies' },
      },
    };
    expect(fromXeroPaymentAsTransaction(payment)).toMatchObject({
      id: 'p-1',
      source: 'payment',
      type: 'spend',
      amount: 480,
      batchPaymentId: 'b-77',
      document: { id: 'inv-9', number: 'FAB-118', kind: 'bill' },
      contact: { id: CONTACT, name: 'Fabrikam Supplies' },
    });
  });

  it('a credit-note refund comes back under Invoice with a credit type', () => {
    const refund = fromXeroPaymentAsTransaction({
      PaymentID: 'p-2',
      PaymentType: 'APCREDITPAYMENT',
      Amount: 25,
      Status: 'AUTHORISED',
      Invoice: { InvoiceID: 'cn-1', Type: 'ACCPAYCREDIT', InvoiceNumber: 'CN-3' },
    });
    expect(refund).toMatchObject({ type: 'receive', document: { kind: 'credit-note' } });
  });

  it('reads one entry from the right endpoint', async () => {
    const { client, calls } = fakeClient((path) =>
      path.startsWith('Payments/')
        ? { Payments: [{ PaymentID: 'p-1', PaymentType: 'ACCRECPAYMENT', Status: 'AUTHORISED' }] }
        : { BankTransactions: [spend] }
    );
    const bank = xeroBank(client);
    expect((await bank.transaction!('p-1', 'payment')).source).toBe('payment');
    expect((await bank.transaction!('bt-1')).source).toBe('bank-transaction');
    expect(calls.map((c) => c.path)).toEqual(['Payments/p-1', 'BankTransactions/bt-1']);
  });
});

describe('xero manual journal status changes', () => {
  const draft: XeroManualJournal = {
    ManualJournalID: 'mj-1',
    Date: '/Date(1790726400000+0000)/',
    Narration: 'Accrue audit fee',
    Status: 'DRAFT',
    LineAmountTypes: 'NoTax',
    ShowOnCashBasisReports: false,
    HasAttachments: true,
    JournalLines: [
      { AccountCode: '404', LineAmount: 900, Tracking: [] },
      { AccountCode: '825', LineAmount: -900 },
    ],
  };

  it('maps the extra journal fields', () => {
    expect(fromXeroManualJournal(draft)).toMatchObject({
      lineAmountType: 'none',
      showOnCashBasisReports: false,
      hasAttachments: true,
    });
  });

  it('re-sends the journal as Xero has it, changing only the status', () => {
    expect(toXeroJournalStatusUpdate(draft, 'posted')).toEqual({
      ManualJournalID: 'mj-1',
      Narration: 'Accrue audit fee',
      Date: '2026-09-30',
      LineAmountTypes: 'NoTax',
      ShowOnCashBasisReports: false,
      JournalLines: draft.JournalLines,
      Status: 'POSTED',
    });
    expect(toXeroJournalStatusUpdate(draft, 'deleted').Status).toBe('DELETED');
    expect(toXeroJournalStatusUpdate({ ...draft, Status: 'POSTED' }, 'voided').Status).toBe(
      'VOIDED'
    );
  });

  it('refuses transitions Xero does not allow', () => {
    expect(() => toXeroJournalStatusUpdate(draft, 'voided')).toThrow(/posted/);
    expect(() => toXeroJournalStatusUpdate({ ...draft, Status: 'POSTED' }, 'deleted')).toThrow();
  });

  it('reads, then posts the update to the journal', async () => {
    const { client, calls } = fakeClient((path, request) =>
      request.method === 'POST'
        ? { ManualJournals: [{ ...draft, Status: 'POSTED' }] }
        : { ManualJournals: [draft] }
    );
    const journal = await xeroJournals(client).setStatus!('mj-1', 'posted');
    expect(journal.status).toBe('posted');
    expect(calls.map((c) => [c.path, c.request.method ?? 'GET'])).toEqual([
      ['ManualJournals/mj-1', 'GET'],
      ['ManualJournals/mj-1', 'POST'],
    ]);
  });
});

function journal(n: number, date: string, lines: [string, number][] = []): XeroJournal {
  return {
    JournalID: `j-${n}`,
    JournalNumber: n,
    JournalDate: `/Date(${Date.parse(`${date}T00:00:00Z`)}+0000)/`,
    SourceType: 'CASHPAID',
    JournalLines: lines.map(([code, amount], i) => ({
      JournalLineID: `j-${n}-${i}`,
      AccountCode: code,
      AccountName: code === '090' ? 'Business Current Account' : 'Office Expenses',
      NetAmount: amount,
    })),
  };
}

describe('xero journals for reports', () => {
  it('maps a journal into ledger lines with Xero source names', () => {
    const ledger = fromXeroJournalToLedger(
      journal(7, '2026-09-02', [
        ['453', 50],
        ['090', -50],
      ])
    );
    expect(ledger).toMatchObject({
      number: '7',
      date: '2026-09-02',
      source: 'Spend Money',
      lines: [
        { accountCode: '453', amount: 50 },
        { accountCode: '090', amount: -50, accountName: 'Business Current Account' },
      ],
    });
    expect(XERO_SOURCE_TYPES.MANJOURNAL).toBe('Manual Journal');
  });

  it('starts the read 31 days before the period', () => {
    expect(lookbackStart('2026-03-01')).toBe('2026-01-29');
  });

  it('reads from If-Modified-Since, then pages forward by journal number to the end', async () => {
    const total = 250;
    const { client, calls } = fakeClient((_path, request) => {
      const offset = Number(request.query?.offset ?? 0);
      const start = request.headers?.['If-Modified-Since'] ? 1 : offset + 1;
      const end = Math.min(total, start + 99);
      return {
        Journals: Array.from({ length: Math.max(0, end - start + 1) }, (_, i) =>
          journal(start + i, '2026-09-01')
        ),
      };
    });
    const journals = await journalsEnteredSince(client, '2026-08-01');
    expect(journals).toHaveLength(total);
    expect(calls[0].request.headers).toEqual({ 'If-Modified-Since': '2026-08-01T00:00:00' });
    expect(calls.slice(1).map((c) => c.request.query?.offset)).toEqual([100, 200, 300]);
  });

  it('refuses rather than returning part of the period', async () => {
    const { client } = fakeClient((_path, request) => {
      const offset = Number(request.query?.offset ?? 0);
      return {
        Journals: Array.from({ length: 100 }, (_, i) => journal(offset + i + 1, '2026-09-01')),
      };
    });
    await expect(journalsEnteredSince(client, '2020-01-01', 6)).rejects.toThrow(/more than 600/);
  });
});

describe('xero organisation settings and users', () => {
  it('maps the settings fields Xero returns', () => {
    const details = fromXeroOrganisation(
      {
        Name: 'Contoso Coffee Roasters',
        LegalName: 'Contoso Coffee Roasters Ltd',
        BaseCurrency: 'GBP',
        CountryCode: 'GB',
        OrganisationType: 'COMPANY',
        Class: 'STANDARD',
        Edition: 'BUSINESS',
        PaysTax: true,
        SalesTaxBasis: 'CASH',
        SalesTaxPeriod: 'QUARTERLY',
        DefaultSalesTax: 'Tax Exclusive',
        DefaultPurchasesTax: 'Tax Inclusive',
        PeriodLockDate: '/Date(1774915200000+0000)/',
        Phones: [{ PhoneType: 'OFFICE', PhoneNumber: '496 0000', PhoneAreaCode: '0161' }],
        PaymentTerms: { Sales: { Day: 14, Type: 'DAYSAFTERBILLDATE' } },
        Addresses: [{ AddressType: 'POBOX' }, { AddressType: 'STREET', AddressLine1: '1 Yard' }],
      },
      'https://go.xero.com/x'
    );
    expect(details).toMatchObject({
      organisationType: 'COMPANY',
      plan: 'STANDARD',
      edition: 'BUSINESS',
      salesTaxBasis: 'CASH',
      periodLockDate: '2026-03-31',
      phone: '0161 496 0000',
      paymentTerms: { sales: { day: 14, type: 'DAYSAFTERBILLDATE' }, bills: undefined },
      address: { line1: '1 Yard' },
      sourceUrl: 'https://go.xero.com/x',
    });
    expect(details.endOfYearLockDate).toBeUndefined();
  });

  it('lists users, leaving out removed ones', async () => {
    expect(
      fromXeroUser({
        UserID: 'u1',
        FirstName: 'Priya',
        LastName: 'Shah',
        EmailAddress: 'priya@example.com',
        OrganisationRole: 'STANDARD',
        IsSubscriber: false,
      })
    ).toMatchObject({ id: 'u1', role: 'STANDARD', email: 'priya@example.com' });
    const { client } = fakeClient(() => ({
      Users: [
        { UserID: 'u2', FirstName: 'Sam', OrganisationRole: 'FINANCIALADVISER' },
        { UserID: 'u3', FirstName: 'Gone', OrganisationRole: 'REMOVED' },
        { UserID: 'u1', FirstName: 'Alex', OrganisationRole: 'READONLY' },
      ],
    }));
    const users = await xeroUsers(client).list();
    expect(users.map((u) => u.id)).toEqual(['u1', 'u2']);
  });
});
