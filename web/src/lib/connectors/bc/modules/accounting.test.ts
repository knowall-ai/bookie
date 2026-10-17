import { describe, expect, it } from 'vitest';
import type { BcClient } from '../client';
import { bcAmount, decodeBcEnum, fromBcAccount, fromBcGlEntry, ytdBalance } from './accounts';
import { BC_BANK_LEDGER_NOTE, bcBank, fromBcBankAccount, toBcBankJournalLines } from './bank';
import {
  bcJournals,
  BC_POSTED_JOURNALS_NOTE,
  fromBcGlEntries,
  groupJournalLines,
  journalBatchCode,
  toBcJournalLines,
} from './journals';
import { fromBcTaxGroup } from './tax-rates';
import { BC_ASSET_STATUS_NOTE, bcAssets, fromBcFixedAsset } from './assets';
import { taxRateOptions } from '@/components/accounting/options';

/* Fixtures are shaped like BC API v2.0 responses, with fictional values. */

describe('bc accounts', () => {
  it('decodes XML-encoded enum values', () => {
    expect(decodeBcEnum('Cost_x0020_of_x0020_Goods_x0020_Sold')).toBe('Cost of Goods Sold');
    expect(decodeBcEnum('_x0020_')).toBe('');
    expect(decodeBcEnum('G_x002F_L_x0020_Account')).toBe('G/L Account');
  });

  it('maps a G/L account to a class and label', () => {
    expect(
      fromBcAccount({
        id: 'g1',
        number: '10110',
        displayName: 'Sale of Finished Goods',
        category: 'Income',
        subCategory: 'Income, Product Sales',
        blocked: false,
        accountType: 'Posting',
      })
    ).toEqual({
      id: 'g1',
      code: '10110',
      name: 'Sale of Finished Goods',
      type: 'Income',
      typeLabel: 'Income, Product Sales',
      class: 'revenue',
      status: 'active',
      isBank: false,
    });
    expect(
      fromBcAccount({
        id: 'g2',
        number: '2',
        displayName: 'x',
        category: 'Cost_x0020_of_x0020_Goods_x0020_Sold',
        accountType: 'Posting',
        blocked: true,
      })
    ).toMatchObject({ class: 'expense', typeLabel: 'Cost of Goods Sold', status: 'archived' });
  });

  it('reads trial balance strings and gives YTD in natural sign', () => {
    expect(bcAmount('539,974.29')).toBe(539974.29);
    expect(bcAmount('0.00')).toBe(0);
    const line = {
      accountId: 'g1',
      number: '10110',
      accountType: 'Posting',
      totalDebit: '16,903.21',
      totalCredit: '136,722.30',
      balanceAtDateDebit: '0.00',
      balanceAtDateCredit: '539,974.29',
    };
    const revenue = fromBcAccount({
      id: 'g1',
      number: '10110',
      displayName: 'Sales',
      category: 'Income',
      accountType: 'Posting',
    });
    expect(ytdBalance(revenue, line)).toBe(119819.09);
    const liability = { ...revenue, class: 'liability' as const };
    expect(ytdBalance(liability, line)).toBe(539974.29);
    // No trial balance line, or no category to sign it by: not available, never 0.
    expect(ytdBalance(revenue, undefined)).toBeUndefined();
    const uncategorised = fromBcAccount({
      id: 'g2',
      number: '99999',
      displayName: 'Suspense',
      category: '_x0020_',
      accountType: 'Posting',
    });
    expect(uncategorised.class).toBeUndefined();
    expect(ytdBalance(uncategorised, line)).toBeUndefined();
  });

  it('maps G/L entries', () => {
    expect(
      fromBcGlEntry({
        id: 'e1',
        entryNumber: 3885,
        postingDate: '2025-12-01',
        documentNumber: '103296',
        documentType: '_x0020_',
        accountNumber: '20110',
        description: 'Direct cost',
        debitAmount: 975,
        creditAmount: 0,
      })
    ).toEqual({
      id: 'e1',
      date: '2025-12-01',
      accountCode: '20110',
      description: 'Direct cost',
      documentNumber: '103296',
      sourceType: undefined,
      debit: 975,
      credit: 0,
    });
  });
});

describe('bc bank', () => {
  it('maps bank accounts without inventing balances', () => {
    expect(
      fromBcBankAccount(
        {
          id: 'k1',
          number: 'CHECKING',
          displayName: 'World Wide Bank',
          bankAccountNumber: '',
          iban: 'GB00TEST',
          currencyCode: '',
        },
        'GBP'
      )
    ).toEqual({
      id: 'k1',
      name: 'World Wide Bank',
      code: 'CHECKING',
      accountNumber: 'GB00TEST',
      currency: 'GBP',
      type: 'bank',
    });
  });

  it('returns an empty register with a note', async () => {
    const page = await bcBank({} as BcClient, async () => 'GBP').transactions('k1');
    expect(page).toMatchObject({ items: [], hasMore: false, note: BC_BANK_LEDGER_NOTE });
  });

  it('builds a balanced spend-money journal', () => {
    const lines = toBcBankJournalLines(
      {
        bankAccountId: 'k1',
        type: 'spend',
        contactId: 'v:1',
        date: '2026-10-01',
        reference: 'R1',
        lineAmountType: 'none',
        lineItems: [
          { description: 'Boxes', quantity: 2, unitAmount: 10, accountCode: '60100' },
          { description: 'Tape', quantity: 1, unitAmount: 5.5, accountCode: '60100' },
        ],
      },
      'CHECKING',
      'BOOKIE-1',
      'Coho Packaging'
    );
    expect(lines[0]).toMatchObject({
      accountType: 'Bank Account',
      accountNumber: 'CHECKING',
      amount: -25.5,
    });
    expect(lines.slice(1).map((l) => l.amount)).toEqual([20, 5.5]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
    expect(new Set(lines.map((l) => l.documentNumber))).toEqual(new Set(['BOOKIE-1']));
  });

  it('refuses VAT it cannot calculate', async () => {
    await expect(
      bcBank({} as BcClient, async () => 'GBP').createTransaction!({
        bankAccountId: 'k1',
        type: 'receive',
        contactId: 'c:1',
        date: '2026-10-01',
        lineAmountType: 'exclusive',
        lineItems: [
          { description: 'x', quantity: 1, unitAmount: 1, accountCode: '1', taxType: 'STANDARD' },
        ],
      })
    ).rejects.toThrow(/VAT/);
  });
});

describe('bc journals', () => {
  const line = (n: number, doc: string, amount: number, account = '10110') => ({
    id: `l${n}`,
    journalId: 'batch-1',
    journalDisplayName: 'Default journal',
    lineNumber: n * 10000,
    accountType: 'G_x002F_L_x0020_Account',
    accountNumber: account,
    postingDate: '2026-10-01',
    documentNumber: doc,
    amount,
    description: `Line ${n}`,
    comment: n === 1 ? 'Accrue rent' : '',
  });

  it('groups draft lines into one journal per document', () => {
    const journals = groupJournalLines([
      line(2, 'G1', -100, '20000'),
      line(1, 'G1', 100),
      line(3, 'G2', 5),
    ]);
    expect(journals).toHaveLength(2);
    expect(journals[0]).toMatchObject({
      id: 'd~batch-1~G1',
      narration: 'Accrue rent',
      status: 'draft',
      total: 100,
    });
    expect(journals[0].lines.map((l) => l.amount)).toEqual([100, -100]);
  });

  it('rebuilds a posted journal from G/L entries', () => {
    expect(
      fromBcGlEntries('p~BOOKIE-1~2026-10-01', [
        {
          id: 'e1',
          postingDate: '2026-10-01',
          documentNumber: 'BOOKIE-1',
          accountNumber: '1',
          description: 'Accrue',
          debitAmount: 10,
          creditAmount: 0,
        },
        {
          id: 'e2',
          postingDate: '2026-10-01',
          documentNumber: 'BOOKIE-1',
          accountNumber: '2',
          debitAmount: 0,
          creditAmount: 10,
        },
      ])
    ).toMatchObject({
      status: 'posted',
      total: 10,
      narration: 'Accrue',
      lines: [{ amount: 10 }, { amount: -10 }],
    });
  });

  it('writes G/L lines with one document number', () => {
    const lines = toBcJournalLines(
      {
        date: '2026-10-01',
        narration: 'Depreciation',
        lines: [
          { accountCode: '1', amount: 5 },
          { accountCode: '2', amount: -5 },
        ],
      },
      'BOOKIE-X'
    );
    expect(lines).toEqual([
      {
        accountType: 'G/L Account',
        accountNumber: '1',
        postingDate: '2026-10-01',
        documentNumber: 'BOOKIE-X',
        amount: 5,
        description: 'Depreciation',
        comment: 'Depreciation',
      },
      {
        accountType: 'G/L Account',
        accountNumber: '2',
        postingDate: '2026-10-01',
        documentNumber: 'BOOKIE-X',
        amount: -5,
        description: 'Depreciation',
        comment: 'Depreciation',
      },
    ]);
    expect(journalBatchCode(1_760_000_000_000)).toMatch(/^BK[0-9A-Z]{1,8}$/);
    expect(journalBatchCode().length).toBeLessThanOrEqual(10);
  });

  it('creates a batch of its own, posts it and removes it', async () => {
    const calls: string[] = [];
    const client = {
      async request(path: string, req: { method?: string } = {}) {
        calls.push(`${req.method ?? 'GET'} ${path}`);
        if (path === 'journals' && req.method === 'POST') return { id: 'new-batch' };
        return undefined;
      },
      async all() {
        return [
          {
            id: 'e1',
            postingDate: '2026-10-01',
            documentNumber: 'BOOKIE-1',
            accountNumber: '1',
            debitAmount: 5,
            creditAmount: 0,
          },
        ];
      },
    } as unknown as BcClient;
    const journal = await bcJournals(client).create!({
      date: '2026-10-01',
      narration: 'Test',
      status: 'posted',
      lines: [
        { accountCode: '1', amount: 5 },
        { accountCode: '2', amount: -5 },
      ],
    });
    expect(calls).toEqual([
      'POST journals',
      'POST journals(new-batch)/journalLines',
      'POST journals(new-batch)/journalLines',
      'POST journals(new-batch)/Microsoft.NAV.post',
      'DELETE journals(new-batch)',
    ]);
    expect(journal.status).toBe('posted');
    expect(journal.id).toMatch(/^p~BOOKIE-/);
  });

  it('rejects unbalanced journals and explains posted ones', async () => {
    const mod = bcJournals({} as BcClient);
    await expect(
      mod.create!({ date: '2026-10-01', narration: 'x', lines: [{ accountCode: '1', amount: 5 }] })
    ).rejects.toThrow(/balance/);
    expect(await mod.list({ status: 'posted' })).toMatchObject({
      items: [],
      note: BC_POSTED_JOURNALS_NOTE,
    });
  });
});

describe('bc tax rates and fixed assets', () => {
  it('lists tax groups without inventing a percentage', () => {
    expect(
      fromBcTaxGroup({
        id: 't1',
        code: 'STANDARD',
        displayName: 'Standard VAT (20%)',
        taxType: 'VAT',
      })
    ).toEqual({
      id: 't1',
      name: 'Standard VAT (20%)',
      taxType: 'STANDARD',
      rate: undefined,
      status: 'active',
    });
  });

  it('shows rate-less tax codes by name only, never as 0%', () => {
    const [option] = taxRateOptions([
      fromBcTaxGroup({ id: 't1', code: 'STANDARD', displayName: 'Standard' }),
    ]);
    expect(option).toEqual({ taxType: 'STANDARD', name: 'Standard', rate: undefined });
    expect(option.name).not.toMatch(/%/);
  });

  it('maps fixed asset cards with an unknown status, not as registered', async () => {
    const asset = fromBcFixedAsset({
      id: 'f1',
      number: 'FA000010',
      displayName: 'Vehicle 1',
      classCode: 'TANGIBLE',
      subclassCode: 'VEHICLES',
    });
    expect(asset).toMatchObject({
      id: 'f1',
      number: 'FA000010',
      name: 'Vehicle 1',
      status: 'unknown',
      assetType: 'TANGIBLE · VEHICLES',
    });
    expect(asset.bookValue).toBeUndefined();
    expect(asset.purchasePrice).toBeUndefined();
    const assets = bcAssets({} as BcClient);
    expect(assets.statuses).toEqual(['unknown']);
    const page = await assets.list({ status: 'registered' });
    expect(page).toMatchObject({ items: [], note: BC_ASSET_STATUS_NOTE });
  });
});
