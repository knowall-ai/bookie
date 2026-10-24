import { expect, it } from 'vitest';
import { DemoMailbox } from '@/lib/email/demo';
import { proposedBill } from './proposal';

const extraction = () => new DemoMailbox().reading('demo-mail-new', 'att-1')!;
it('copies printed values without assigning tax rates or accounts', () => {
  const ex = extraction();
  const proposal = proposedBill(ex, 'supplier');
  expect(proposal.initial).toMatchObject({
    contactId: 'supplier',
    date: ex.invoiceDate,
    number: ex.invoiceNumber,
    currency: ex.currency,
  });
  expect(proposal.initial.lineItems?.[0]).toMatchObject({
    quantity: ex.lines[0].quantity,
    unitAmount: ex.lines[0].unitPrice,
  });
  expect(proposal.initial.lineItems?.[0].taxType).toBeUndefined();
  expect(proposal.initial.lineItems?.[0].accountCode).toBeUndefined();
});
it('leaves missing fields blank, drops unpriced lines, and explains missing tax treatment', () => {
  const ex = extraction();
  Object.assign(ex, {
    invoiceDate: null,
    dueDate: null,
    invoiceNumber: null,
    currency: null,
    amountsAre: null,
  });
  ex.lines = [
    { description: 'Unpriced', quantity: 2, unitPrice: null, net: 100, vatRate: null, vat: null },
  ];
  const proposal = proposedBill(ex, undefined);
  expect(proposal.initial).toMatchObject({
    contactId: '',
    date: '',
    dueDate: undefined,
    number: undefined,
    currency: undefined,
    lineItems: [],
    lineAmountType: undefined,
  });
  expect(proposal.notes.map((n) => n.field)).toEqual(['lines.0', 'amountsAre', 'account']);
});
it('copies a single printed amount and maps no-tax without estimating prices', () => {
  const ex = extraction();
  ex.amountsAre = 'no-tax';
  ex.lines = [
    { description: 'Service', quantity: null, unitPrice: null, net: 75, vatRate: null, vat: null },
  ];
  expect(proposedBill(ex, undefined).initial).toMatchObject({
    lineAmountType: 'none',
    lineItems: [{ description: 'Service', quantity: 1, unitAmount: 75 }],
  });
});
