import { describe, expect, it } from 'vitest';
import type { XeroClient } from '../client';
import { fromXeroAccount, fromXeroJournal, trialBalanceByAccount, toXeroAccount } from './accounts';
import {
  closingBalances,
  fromXeroBankAccount,
  fromXeroBankTransaction,
  fromXeroPaymentAsTransaction,
  toXeroBankTransaction,
  xeroBank,
} from './bank';
import { fromXeroManualJournal, toXeroManualJournal } from './journals';
import { fromXeroTaxRate } from './tax-rates';
import { fromXeroAsset } from './assets';

/* Fixtures are shaped like the live API responses, with fictional values. */

describe('xero accounts', () => {
  it('maps types to Xero labels and classes', () => {
    const account = fromXeroAccount({
      AccountID: 'a1',
      Code: '820',
      Name: 'VAT',
      Type: 'CURRLIAB',
      Class: 'LIABILITY',
      Status: 'ACTIVE',
      TaxType: 'NONE',
      Description: 'VAT owed to HMRC',
    });
    expect(account).toMatchObject({
      code: '820',
      type: 'CURRLIAB',
      typeLabel: 'Current Liability',
      class: 'liability',
      status: 'active',
      isBank: false,
      description: 'VAT owed to HMRC',
    });
    expect(
      fromXeroAccount({ AccountID: 'b', Name: 'Current', Type: 'BANK', Class: 'ASSET' })
    ).toMatchObject({ typeLabel: 'Bank', isBank: true, code: '', status: 'archived' });
    expect(fromXeroAccount({ AccountID: 'c', Name: 'Loan', Type: 'TERMLIAB' })).toMatchObject({
      typeLabel: 'Non-current Liability',
      class: 'liability',
    });
  });

  it('reads YTD balances from the trial balance', () => {
    const balances = trialBalanceByAccount({
      ReportName: 'Trial Balance',
      Rows: [
        {
          RowType: 'Header',
          Cells: [
            { Value: 'Account' },
            { Value: 'Debit' },
            { Value: 'Credit' },
            { Value: 'YTD Debit' },
            { Value: 'YTD Credit' },
          ],
        },
        {
          RowType: 'Section',
          Title: 'Revenue',
          Rows: [
            {
              RowType: 'Row',
              Cells: [
                { Value: 'Sales (200)', Attributes: [{ Id: 'account', Value: 'acc-200' }] },
                { Value: '' },
                { Value: '120.00' },
                { Value: '' },
                { Value: '4500.00' },
              ],
            },
            { RowType: 'SummaryRow', Cells: [{ Value: 'Total' }] },
          ],
        },
      ],
    });
    expect(balances.get('acc-200')).toBe(-4500);
    expect(balances.size).toBe(1);
  });

  it('flattens journals into ledger lines', () => {
    const lines = fromXeroJournal({
      JournalID: 'j1',
      JournalNumber: 7,
      JournalDate: '/Date(1760313600000+0000)/',
      Reference: 'INV-0007',
      SourceType: 'ACCREC',
      JournalLines: [
        { JournalLineID: 'l1', AccountCode: '610', AccountName: 'Debtors', NetAmount: 120 },
        { JournalLineID: 'l2', AccountCode: '200', Description: 'Coffee', NetAmount: -100 },
      ],
    });
    expect(lines[0]).toMatchObject({
      date: '2025-10-13',
      debit: 120,
      credit: 0,
      documentNumber: 'INV-0007',
    });
    expect(lines[1]).toMatchObject({ debit: 0, credit: 100, description: 'Coffee' });
  });

  it('builds the create payload', () => {
    expect(
      toXeroAccount({ code: '499', name: 'Stall fees', type: 'EXPENSE', taxType: '' })
    ).toEqual({
      Code: '499',
      Name: 'Stall fees',
      Type: 'EXPENSE',
      TaxType: undefined,
      Description: undefined,
    });
  });
});

describe('xero bank', () => {
  it('maps bank accounts and Bank Summary closing balances', () => {
    expect(
      fromXeroBankAccount({
        AccountID: 'b1',
        Code: '090',
        Name: 'Business Current',
        Type: 'BANK',
        BankAccountNumber: '20000041234567',
        BankAccountType: 'CREDITCARD',
        CurrencyCode: 'GBP',
      })
    ).toMatchObject({
      id: 'b1',
      type: 'credit-card',
      currency: 'GBP',
      accountNumber: '20000041234567',
    });

    const balances = closingBalances({
      ReportName: 'Bank Summary',
      Rows: [
        { RowType: 'Header', Cells: [{ Value: 'Bank Accounts' }] },
        {
          RowType: 'Section',
          Rows: [
            {
              RowType: 'Row',
              Cells: [
                { Value: 'Business Current', Attributes: [{ Id: 'accountID', Value: 'b1' }] },
                { Value: '100.00' },
                { Value: '50.00' },
                { Value: '-20.00' },
                { Value: '130.00' },
              ],
            },
          ],
        },
      ],
    });
    expect(balances.get('b1')).toBe(130);
  });

  it('maps spend, receive and transfer transactions', () => {
    const spend = fromXeroBankTransaction({
      BankTransactionID: 't1',
      Type: 'SPEND',
      Contact: { ContactID: 'c1', Name: 'Coho Packaging' },
      BankAccount: { AccountID: 'b1', Name: 'Business Current' },
      DateString: '2026-08-21T00:00:00',
      Reference: 'Boxes',
      Total: 60,
      IsReconciled: true,
      Status: 'AUTHORISED',
      LineItems: [{ Description: 'Mailer boxes', Quantity: 1, UnitAmount: 50, LineAmount: 50 }],
    });
    expect(spend).toMatchObject({
      type: 'spend',
      date: '2026-08-21',
      description: 'Mailer boxes',
      contact: { id: 'c1', name: 'Coho Packaging' },
      isReconciled: true,
      amount: 60,
    });
    const transfer = fromXeroBankTransaction({
      BankTransactionID: 't2',
      Type: 'RECEIVE-TRANSFER',
      BankAccount: { AccountID: 'b1' },
      Date: '/Date(1787270400000+0000)/',
      Total: 500,
      Status: 'AUTHORISED',
      LineItems: [],
    });
    expect(transfer).toMatchObject({ type: 'transfer-in', description: 'Bank transfer' });
  });

  it('maps invoice payments into the register', () => {
    expect(
      fromXeroPaymentAsTransaction({
        PaymentID: 'p1',
        PaymentType: 'ACCRECPAYMENT',
        Date: '/Date(1760313600000+0000)/',
        Amount: 120,
        BankAmount: 120,
        IsReconciled: false,
        Status: 'AUTHORISED',
        Account: { AccountID: 'b1' },
        Invoice: { InvoiceNumber: 'INV-0007', Contact: { ContactID: 'c1', Name: 'Northwind' } },
      })
    ).toMatchObject({
      type: 'receive',
      reference: 'INV-0007',
      description: 'Payment: Northwind',
      bankAccountId: 'b1',
    });
    expect(
      fromXeroPaymentAsTransaction({
        PaymentID: 'p2',
        PaymentType: 'ACCPAYPAYMENT',
        Status: 'AUTHORISED',
      }).type
    ).toBe('spend');
  });

  it('builds spend money for PUT BankTransactions', () => {
    expect(
      toXeroBankTransaction({
        bankAccountId: 'b1',
        type: 'spend',
        contactId: 'c1',
        date: '2026-10-01',
        lineAmountType: 'inclusive',
        lineItems: [{ description: 'Milk', quantity: 1, unitAmount: 12, accountCode: '310' }],
      })
    ).toMatchObject({
      Type: 'SPEND',
      Contact: { ContactID: 'c1' },
      BankAccount: { AccountID: 'b1' },
      LineAmountTypes: 'Inclusive',
      Status: 'AUTHORISED',
      LineItems: [{ Description: 'Milk', AccountCode: '310', UnitAmount: 12 }],
    });
  });

  it('merges transactions and payments newest first and pages them', async () => {
    const calls: { path: string; query: Record<string, unknown> }[] = [];
    const client = {
      async request(path: string, req: { query: Record<string, unknown> }) {
        calls.push({ path, query: req.query });
        if (path === 'BankTransactions') {
          return {
            pagination: { itemCount: 2 },
            BankTransactions: [
              {
                BankTransactionID: 't-new',
                Type: 'SPEND',
                BankAccount: { AccountID: 'b1' },
                DateString: '2026-10-10T00:00:00',
                Total: 5,
                Status: 'AUTHORISED',
              },
              {
                BankTransactionID: 't-old',
                Type: 'RECEIVE',
                BankAccount: { AccountID: 'b1' },
                DateString: '2026-01-01T00:00:00',
                Total: 9,
                Status: 'AUTHORISED',
              },
            ],
          };
        }
        return {
          pagination: { itemCount: 1 },
          Payments: [
            {
              PaymentID: 'p-mid',
              PaymentType: 'ACCRECPAYMENT',
              Date: '2026-05-05T00:00:00',
              Amount: 7,
              Status: 'AUTHORISED',
              Account: { AccountID: 'b1' },
            },
          ],
        };
      },
    } as unknown as XeroClient;
    const page1 = await xeroBank(client).transactions('b1', { page: 1, pageSize: 2 });
    expect(page1.items.map((t) => t.id)).toEqual(['t-new', 'p-mid']);
    expect(page1).toMatchObject({ total: 3, hasMore: true });
    const page2 = await xeroBank(client).transactions('b1', { page: 2, pageSize: 2 });
    expect(page2.items.map((t) => t.id)).toEqual(['t-old']);
    expect(page2.hasMore).toBe(false);
    expect(calls[0].query.where).toContain('BankAccount.AccountID==guid("b1")');
    expect(calls.find((c) => c.path === 'Payments')?.query.where).toContain(
      'Account.AccountID==guid("b1")'
    );
  });
});

describe('xero manual journals', () => {
  it('maps a posted journal; debits are positive', () => {
    const journal = fromXeroManualJournal({
      ManualJournalID: 'm1',
      Date: '/Date(1575072000000+0000)/',
      Narration: 'Accrue rent',
      Status: 'POSTED',
      DebitTotal: 100,
      JournalLines: [
        { AccountCode: '469', LineAmount: 100, TaxType: 'NONE' },
        { AccountCode: '825', LineAmount: -100, Description: 'Accrual' },
      ],
    });
    expect(journal).toMatchObject({ id: 'm1', date: '2019-11-30', status: 'posted', total: 100 });
    expect(journal.lines).toEqual([
      { accountCode: '469', description: undefined, amount: 100, taxType: undefined },
      { accountCode: '825', description: 'Accrual', amount: -100, taxType: undefined },
    ]);
  });

  it('builds the create payload with NoTax unless a tax rate is used', () => {
    const body = toXeroManualJournal({
      date: '2026-10-01',
      narration: 'Depreciation',
      status: 'posted',
      lines: [
        { accountCode: '416', amount: 50 },
        { accountCode: '711', amount: -50 },
      ],
    });
    expect(body).toMatchObject({ Status: 'POSTED', LineAmountTypes: 'NoTax' });
    expect(body.JournalLines).toEqual([
      { AccountCode: '416', Description: undefined, LineAmount: 50, TaxType: undefined },
      { AccountCode: '711', Description: undefined, LineAmount: -50, TaxType: undefined },
    ]);
    expect(
      toXeroManualJournal({
        date: '2026-10-01',
        narration: 'x',
        lines: [{ accountCode: '400', amount: 12, taxType: 'INPUT2' }],
      })
    ).toMatchObject({ Status: 'DRAFT', LineAmountTypes: 'Inclusive' });
  });
});

describe('xero tax rates and assets', () => {
  it('uses the effective rate', () => {
    expect(
      fromXeroTaxRate({
        Name: '20% (VAT on Income)',
        TaxType: 'OUTPUT2',
        EffectiveRate: 20,
        Status: 'ACTIVE',
      })
    ).toEqual({
      id: 'OUTPUT2',
      name: '20% (VAT on Income)',
      taxType: 'OUTPUT2',
      rate: 20,
      status: 'active',
    });
  });

  it('maps an asset from the Assets API', () => {
    expect(
      fromXeroAsset({
        assetId: 'f1',
        assetName: 'Roaster',
        assetNumber: 'FA-0001',
        assetStatus: 'Registered',
        purchaseDate: '2025-02-08T00:00:00',
        purchasePrice: 1000,
        accountingBookValue: 800,
      })
    ).toEqual({
      id: 'f1',
      number: 'FA-0001',
      name: 'Roaster',
      status: 'registered',
      purchaseDate: '2025-02-08',
      purchasePrice: 1000,
      bookValue: 800,
    });
  });
});
