import type { BankStatementLine } from '@/lib/domain/types';
import { contactKeyword } from '@/lib/reconcile/match';
import { DEMO_TODAY, type DemoData } from '../data';
import type { BankModule } from '../../types';
import { notFound } from '../index';
import { demoSlot } from './state';

const r2 = (n: number) => Math.round(n * 100) / 100;

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Two days after the due date, or yesterday if that's still to come. */
function paidDate(dueDate: string | undefined, today: string) {
  const date = addDays(dueDate ?? today, 2);
  return date > today ? addDays(today, -1) : date;
}

/**
 * A fictional bank feed for the Business Current Account, built once from the
 * demo books so each Reconcile case appears: an exact match, a part-payment,
 * a match on the customer's reference, a bill paid out, a line with no match,
 * a line naming a euro invoice (never matched across currencies), and a line
 * whose payment is already in the books.
 */
export function seedStatementLines(data: DemoData): BankStatementLine[] {
  const today = DEMO_TODAY();
  const account = 'acc-090';
  const open = (type: 'sales' | 'purchase', currency = 'GBP') =>
    data.invoices
      .filter(
        (i) =>
          i.type === type && i.status === 'authorised' && i.currency === currency && i.amountDue > 0
      )
      // Oldest first: other demo flows pay the newest documents.
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const sales = open('sales');
  // One document per case, each for a different customer, so the cases stay distinct.
  const picked: typeof sales = [];
  for (const invoice of sales) {
    if (picked.length === 3) break;
    if (!picked.some((p) => p.contact.id === invoice.contact.id)) picked.push(invoice);
  }
  const [exact, part, byReference] = picked;
  const bill = open('purchase')[0];
  const euro = open('sales', 'EUR')[0];
  const paid = data.bankTransactions.find(
    (t) =>
      t.bankAccountId === account &&
      /^bt-\d+$/.test(t.id) &&
      t.type === 'receive' &&
      !t.isReconciled &&
      t.status === 'authorised'
  );
  const upper = (name: string) => (contactKeyword(name) ?? name).toUpperCase();

  const lines: Omit<BankStatementLine, 'id' | 'bankAccountId' | 'currency'>[] = [];
  if (exact) {
    lines.push({
      date: paidDate(exact.dueDate, today),
      direction: 'in',
      amount: exact.amountDue,
      description: `FASTER PAYMENT ${upper(exact.contact.name)}`,
    });
  }
  if (part) {
    lines.push({
      date: paidDate(part.dueDate, today),
      direction: 'in',
      amount: r2(Math.floor(part.amountDue * 0.4)),
      reference: `${part.number} PART`,
      description: 'BANK GIRO CREDIT',
    });
  }
  if (byReference?.reference) {
    lines.push({
      date: paidDate(byReference.dueDate, today),
      direction: 'in',
      amount: byReference.amountDue,
      reference: byReference.reference.toUpperCase(),
      description: 'BACS CREDIT',
    });
  }
  if (bill) {
    lines.push({
      date: paidDate(bill.dueDate, today),
      direction: 'out',
      amount: bill.amountDue,
      reference: bill.number,
      description: `DIRECT DEBIT ${upper(bill.contact.name)}`,
    });
  }
  lines.push({
    date: addDays(today, -4),
    direction: 'in',
    amount: 18.27,
    reference: 'INTEREST',
    description: 'GROSS INTEREST',
  });
  if (euro) {
    lines.push({
      date: addDays(today, -2),
      direction: 'in',
      amount: 900,
      reference: euro.number,
      description: 'INTERNATIONAL CREDIT',
    });
  }
  if (paid) {
    lines.push({
      date: addDays(paid.date, 1),
      direction: 'in',
      amount: paid.amount,
      reference: paid.reference,
      description: 'FASTER PAYMENT',
    });
  }
  return lines
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((l, i) => ({ ...l, id: `sl-${i + 1}`, bankAccountId: account, currency: 'GBP' }));
}

/** Demo statement lines and the demo's Reconcile guide, alongside `demoBank`. */
export function demoReconcile(data: DemoData): Pick<BankModule, 'statementLines' | 'reconcile'> {
  return {
    async statementLines(bankAccountId) {
      if (!data.bankAccounts.some((a) => a.id === bankAccountId)) notFound('Bank account');
      const lines = demoSlot(data, 'statement-lines', () => seedStatementLines(data));
      return structuredClone(lines.filter((l) => l.bankAccountId === bankAccountId));
    },
    reconcile: {
      afterPayment:
        "Demo books: as in Xero, Bookie records the payment and the statement line stays to be reconciled in the source's own Reconcile screen. The demo has no such screen, so the line now shows the payment as already recorded.",
    },
  };
}
