import { describe, expect, it } from 'vitest';
import {
  financialYearEndLabel,
  humanise,
  paymentTermLabel,
  ROLE_LABELS,
  salesTaxBasisLabel,
  salesTaxPeriodLabel,
} from './org-settings';
import { demoBank } from '@/lib/connectors/demo/modules/bank';
import { demoJournals } from '@/lib/connectors/demo/modules/journals';
import { demoUsers } from '@/lib/connectors/demo/modules/users';
import { demoData } from '@/lib/connectors/demo/data';
import { fromJournalLine } from '@/components/accounting/JournalEditor';
import { reverseJournalLines } from '@/components/accounting/journal-lines';
import { registerTypeLabel } from '@/components/accounting/register';

describe('org settings labels', () => {
  it('uses Xero wording and never invents a meaning for unknown codes', () => {
    expect(humanise('SOLE_TRADER')).toBe('Sole trader');
    expect(ROLE_LABELS.FINANCIALADVISER).toBe('Adviser');
    expect(financialYearEndLabel(31, 3)).toBe('31 March');
    expect(financialYearEndLabel(undefined, 3)).toBeUndefined();
    expect(paymentTermLabel({ day: 14, type: 'DAYSAFTERBILLDATE' }, 'invoice')).toBe(
      '14 days after the invoice date'
    );
    expect(paymentTermLabel({ day: 20, type: 'OFFOLLOWINGMONTH' }, 'bill')).toBe(
      'Day 20 of the following month'
    );
    expect(paymentTermLabel({ day: 3, type: 'SOMETHINGNEW' }, 'bill')).toBe('3 (Somethingnew)');
    expect(salesTaxBasisLabel('CASH')).toBe('Cash basis');
    expect(salesTaxPeriodLabel('QUARTERLY')).toBe('Quarterly');
    expect(salesTaxPeriodLabel('QUARTERLY1')).toBe('Quarterly1');
  });
});

describe('demo register, journals and users', () => {
  it('filters the register by direction, reconciled and contact', async () => {
    const data = demoData('contoso');
    const bank = demoBank(data);
    const all = await bank.transactions('acc-090', { pageSize: 500 });
    const spent = await bank.transactions('acc-090', { direction: 'spent', pageSize: 500 });
    const received = await bank.transactions('acc-090', { direction: 'received', pageSize: 500 });
    expect(spent.total! + received.total!).toBe(all.total);
    expect(spent.items.every((t) => t.type === 'spend' || t.type === 'transfer-out')).toBe(true);
    const open = await bank.transactions('acc-090', { reconciled: false, pageSize: 500 });
    expect(open.items.every((t) => !t.isReconciled)).toBe(true);
    const withContact = all.items.find((t) => t.contact)!;
    const byContact = await bank.transactions('acc-090', {
      contactId: withContact.contact!.id,
      pageSize: 500,
    });
    expect(byContact.items.every((t) => t.contact?.id === withContact.contact!.id)).toBe(true);
    // Invoice payments are payments, linked to the document they pay.
    const payment = all.items.find((t) => t.source === 'payment')!;
    expect(payment.document?.number).toBe(payment.reference);
    expect((await bank.transaction!(payment.id)).id).toBe(payment.id);
    expect(registerTypeLabel(payment)).toMatch(/payment$/);
  });

  it('posts, voids and deletes demo journals only along allowed transitions', async () => {
    const journals = demoJournals(demoData('contoso-wholesale'));
    await expect(journals.setStatus!('mj-003', 'deleted')).rejects.toThrow(/draft/);
    expect((await journals.setStatus!('mj-001', 'posted')).status).toBe('posted');
    expect((await journals.setStatus!('mj-001', 'voided')).status).toBe('voided');
    expect((await journals.list({ status: 'voided' })).items.map((j) => j.id)).toContain('mj-001');
  });

  it('lists fictional users', async () => {
    const users = await demoUsers().list();
    expect(users.length).toBeGreaterThan(2);
    expect(users.every((u) => u.email?.endsWith('example.com'))).toBe(true);
  });
});

describe('reversing a journal', () => {
  it('swaps debits and credits and loads them back into the editor', () => {
    const reversed = reverseJournalLines([
      { accountCode: '416', amount: 708.33, description: 'Depreciation' },
      { accountCode: '711', amount: -708.33 },
    ]);
    expect(reversed.map((l) => l.amount)).toEqual([-708.33, 708.33]);
    expect(reversed.map(fromJournalLine)).toEqual([
      { accountCode: '416', description: 'Depreciation', taxType: '', debit: '', credit: '708.33' },
      { accountCode: '711', description: '', taxType: '', debit: '708.33', credit: '' },
    ]);
  });
});
