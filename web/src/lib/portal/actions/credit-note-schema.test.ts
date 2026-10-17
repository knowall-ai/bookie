import { describe, expect, it } from 'vitest';
import { allocationSchema, creditNoteSchema, noteSchema } from './credit-note-schema';

describe('credit note schemas', () => {
  it('validates a credit note', () => {
    const ok = creditNoteSchema.parse({
      type: 'sales',
      contactId: 'c-1',
      date: '2026-05-01',
      lineItems: [{ description: 'Refund', quantity: '1', unitAmount: '10' }],
    });
    expect(ok.lineItems[0]).toMatchObject({ quantity: 1, unitAmount: 10 });
    expect(() =>
      creditNoteSchema.parse({ type: 'sales', contactId: '', date: '2026-05-01', lineItems: [] })
    ).toThrow();
    expect(() =>
      creditNoteSchema.parse({ type: 'refund', contactId: 'c', date: '1/5/26', lineItems: [{}] })
    ).toThrow();
  });

  it('rounds allocation amounts and refuses zero', () => {
    expect(
      allocationSchema.parse({ invoiceId: 'inv-1', amount: '12.345', date: '2026-05-01' })
    ).toEqual({
      invoiceId: 'inv-1',
      amount: 12.35,
      date: '2026-05-01',
    });
    expect(() =>
      allocationSchema.parse({ invoiceId: 'inv-1', amount: 0, date: '2026-05-01' })
    ).toThrow(/above zero/);
    expect(() =>
      allocationSchema.parse({ invoiceId: '', amount: 1, date: '2026-05-01' })
    ).toThrow();
  });

  it('validates notes', () => {
    expect(
      noteSchema.parse({ entity: 'contact', id: 'c-1', note: '  Called about INV-1  ' }).note
    ).toBe('Called about INV-1');
    expect(() => noteSchema.parse({ entity: 'contact', id: 'c-1', note: '   ' })).toThrow(
      /Write a note/
    );
    expect(() => noteSchema.parse({ entity: 'payment', id: 'p', note: 'x' })).toThrow();
    expect(() => noteSchema.parse({ entity: 'quote', id: 'q', note: 'x'.repeat(2501) })).toThrow();
  });
});
