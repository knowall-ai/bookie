import { describe, expect, it } from 'vitest';
import type { BankTransaction, Invoice } from '@/lib/domain/types';
import {
  contactKeyword,
  findRecorded,
  reconcileLines,
  scoreCandidate,
  searchCandidates,
  suggestForLine,
  type BankLine,
} from './match';

const options = { accountCurrency: 'GBP', sourceName: 'Xero' };

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    type: 'sales',
    number: 'INV-0042',
    contact: { id: 'c-1', name: 'Contoso Coffee Ltd' },
    date: '2026-09-01',
    dueDate: '2026-10-01',
    status: 'authorised',
    currency: 'GBP',
    subTotal: 1000,
    totalTax: 200,
    total: 1200,
    amountDue: 1200,
    amountPaid: 0,
    isOverdue: true,
    ...over,
  };
}

function line(over: Partial<BankLine> = {}): BankLine {
  return { id: 'l-1', date: '2026-10-03', direction: 'in', amount: 1200, ...over };
}

function entry(over: Partial<BankTransaction> = {}): BankTransaction {
  return {
    id: 'pay-1',
    bankAccountId: 'acc-1',
    date: '2026-10-02',
    type: 'receive',
    amount: 1200,
    isReconciled: false,
    status: 'authorised',
    source: 'payment',
    document: { id: 'inv-1', number: 'INV-0042', kind: 'invoice' },
    ...over,
  };
}

describe('scoreCandidate', () => {
  it('explains an exact match in plain words, amount first', () => {
    const s = scoreCandidate(line({ reference: 'INV0042 CONTOSO' }), invoice(), options)!;
    expect(s.reasons).toEqual([
      'same amount',
      'reference has INV-0042',
      'reference has Contoso Coffee Ltd',
      '2 days after due date',
    ]);
    expect(s.payable).toBe(true);
  });

  it('treats a smaller line as a part-payment of the amount due', () => {
    const s = scoreCandidate(line({ amount: 400 }), invoice(), options)!;
    expect(s.reasons[0]).toBe('part-payment: £400.00 of £1,200.00 due');
  });

  it('uses what is still due, not the total, on a part-paid invoice', () => {
    const s = scoreCandidate(line({ amount: 700 }), invoice({ amountDue: 700 }), options)!;
    expect(s.reasons[0]).toBe('same amount');
  });

  it('never offers a line bigger than the amount due', () => {
    expect(scoreCandidate(line({ amount: 1300 }), invoice(), options)).toBeUndefined();
  });

  it('never matches across currencies', () => {
    expect(scoreCandidate(line(), invoice({ currency: 'EUR' }), options)).toBeUndefined();
    expect(
      scoreCandidate(line({ currency: 'EUR' }), invoice({ currency: 'GBP' }), options)
    ).toBeUndefined();
  });

  it('matches money in to sales invoices and money out to bills only', () => {
    expect(scoreCandidate(line({ direction: 'out' }), invoice(), options)).toBeUndefined();
    expect(
      scoreCandidate(line({ direction: 'out' }), invoice({ type: 'purchase' }), options)
    ).toBeDefined();
  });

  it('skips documents that are not awaiting payment', () => {
    for (const status of ['draft', 'submitted', 'paid', 'voided'] as const) {
      expect(scoreCandidate(line(), invoice({ status }), options)).toBeUndefined();
    }
  });

  it('does not treat an unknown amount due as zero or as the total', () => {
    const s = scoreCandidate(line({ reference: 'INV-0042' }), invoice({ amountDue: undefined }), {
      ...options,
      sourceName: 'Business Central',
    })!;
    expect(s.reasons).toContain('amount due not available from Business Central');
    expect(s.reasons).not.toContain('same amount');
    expect(s.payable).toBe(false);
    expect(s.blocked).toMatch(/isn't available from Business Central/);
  });

  it('describes dates before the due date and with no due date', () => {
    expect(scoreCandidate(line({ date: '2026-09-29' }), invoice(), options)!.reasons).toContain(
      '2 days before due date'
    );
    expect(scoreCandidate(line({ date: '2026-10-01' }), invoice(), options)!.reasons).toContain(
      'on the due date'
    );
    expect(
      scoreCandidate(line({ date: '2026-09-02' }), invoice({ dueDate: undefined }), options)!
        .reasons
    ).toContain('1 day after invoice date');
  });

  it('gives no date reason outside the window', () => {
    const late = scoreCandidate(line({ date: '2027-03-01' }), invoice(), options)!;
    expect(late.reasons.some((r) => r.includes('due date'))).toBe(false);
    const early = scoreCandidate(line({ date: '2026-08-01' }), invoice(), options)!;
    expect(early.reasons.some((r) => r.includes('date'))).toBe(false);
  });

  it('finds the customer reference and the contact in the description', () => {
    const s = scoreCandidate(
      line({ amount: 100, description: 'FPS CREDIT PO 4123 contoso' }),
      invoice({ reference: 'PO 4123' }),
      options
    )!;
    expect(s.reasons).toContain('description has PO 4123');
    expect(s.reasons).toContain('description has Contoso Coffee Ltd');
  });
});

describe('suggestForLine', () => {
  it('lists several candidates best first', () => {
    const result = suggestForLine(
      line({ amount: 300, reference: 'CONTOSO INV-0043' }),
      [
        invoice({ id: 'a', number: 'INV-0041', amountDue: 900 }),
        invoice({ id: 'b', number: 'INV-0043', amountDue: 300 }),
        invoice({ id: 'c', number: 'INV-0044', amountDue: 500 }),
      ],
      options
    );
    expect(result.kind).toBe('suggestions');
    if (result.kind !== 'suggestions') return;
    expect(result.suggestions.map((s) => s.invoice.id)).toEqual(['b', 'a', 'c']);
  });

  it('suggests on an exact amount alone but not on a weak part-payment alone', () => {
    expect(suggestForLine(line(), [invoice()], options).kind).toBe('suggestions');
    expect(suggestForLine(line({ amount: 10 }), [invoice()], options).kind).toBe('no-match');
  });

  it('says no match and names invoices skipped for being in another currency', () => {
    const eur = invoice({ id: 'eur', number: 'INV-1091', currency: 'EUR' });
    const result = suggestForLine(line({ reference: 'INV-1091' }), [eur], options);
    expect(result).toEqual({ kind: 'no-match', otherCurrency: [eur] });
  });

  it("won't compare when the account's currency is unknown", () => {
    const result = suggestForLine(line(), [invoice()], { sourceName: 'Xero' });
    expect(result.kind).toBe('not-comparable');
  });
});

describe('findRecorded', () => {
  it('finds an unreconciled payment for the same amount within a week', () => {
    expect(findRecorded(line(), [entry()])?.id).toBe('pay-1');
  });

  it('ignores reconciled, other-direction, other-amount and far-off entries', () => {
    expect(findRecorded(line(), [entry({ isReconciled: true })])).toBeUndefined();
    expect(findRecorded(line(), [entry({ type: 'spend' })])).toBeUndefined();
    expect(findRecorded(line(), [entry({ amount: 1199 })])).toBeUndefined();
    expect(findRecorded(line(), [entry({ date: '2026-09-20' })])).toBeUndefined();
  });

  it('prefers the entry for the document the line names', () => {
    const other = entry({
      id: 'pay-2',
      date: '2026-10-03',
      document: { id: 'x', number: 'INV-0050', kind: 'invoice' },
    });
    expect(findRecorded(line({ reference: 'INV-0042' }), [other, entry()])?.id).toBe('pay-1');
  });
});

describe('reconcileLines', () => {
  it('lets each existing entry explain only one line', () => {
    const lines = [line({ id: 'a' }), line({ id: 'b', date: '2026-10-04' })];
    const outcomes = reconcileLines(lines, [invoice()], [entry()], options);
    expect(outcomes.get('a')?.kind).toBe('already-recorded');
    expect(outcomes.get('b')?.kind).toBe('suggestions');
  });
});

describe('searchCandidates', () => {
  it('filters by number, reference or contact and has no threshold', () => {
    const found = searchCandidates(
      line({ amount: 1 }),
      [
        invoice(),
        invoice({ id: 'x', number: 'INV-0099', contact: { id: 'n', name: 'Northwind' } }),
      ],
      'north',
      options
    );
    expect(found.map((s) => s.invoice.id)).toEqual(['x']);
  });
});

describe('contactKeyword', () => {
  it('skips corporate words and short words', () => {
    expect(contactKeyword('The Contoso Group Ltd')).toBe('contoso');
    expect(contactKeyword('Fabrikam SA de CV')).toBe('fabrikam');
    expect(contactKeyword('Ltd')).toBeUndefined();
  });
});
