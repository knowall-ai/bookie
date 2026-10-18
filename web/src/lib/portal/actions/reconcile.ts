'use server';

import { z } from 'zod';
import { orgContext, sourceName } from '@/lib/portal/context';
import { canPay, unreconciledEntries } from '@/lib/portal/reconcile';
import {
  assignRecorded,
  findRecorded,
  paidAlready,
  isCalendarDate,
  type BankLine,
} from '@/lib/reconcile/match';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { recordPayment } from './payments';
import { describeError, isoDate, type ActionResult } from './util';

const matchSchema = z.object({
  invoiceId: z.string().min(1),
  bankAccountId: z.string().min(1),
  /** A statement line from the source; its amount, date and reference are re-read from there. */
  lineId: z.string().max(100).optional(),
  direction: z.enum(['in', 'out']),
  date: isoDate.refine(isCalendarDate, 'Use a valid date.'),
  amount: z.coerce.number().finite().positive('The line has no amount to match.'),
  reference: z.string().trim().max(255).optional(),
  /** The amount due the page showed, so a change since (another tab, another person) is caught. */
  expectedAmountDue: z.coerce.number().finite(),
  /** The person saw that something for this amount is already in the books and chose to go on. */
  acknowledgeSimilar: z.boolean().optional(),
});

export type MatchInput = z.input<typeof matchSchema>;

/**
 * Reconcile's "Match": record a payment against an open invoice or bill from
 * this bank account, for the bank line's amount and date. Re-checks what the
 * page showed (direction, currency, amount due, nothing already recorded),
 * then records the payment through `recordPayment`, which re-reads the
 * document and refuses more than the amount due. The UI confirms first.
 */
export async function matchBankLine(
  orgKey: string,
  input: MatchInput
): Promise<ActionResult<{ paymentId: string }>> {
  try {
    const parsed = matchSchema.parse(input);
    const { connector, org } = await orgContext(orgKey);
    const source = sourceName(org);
    const bank = connector.bank;
    if (!bank || !connector.invoices) {
      return { ok: false, error: 'This organisation has no bank accounts here.' };
    }
    const account = (await bank.accounts()).find((a) => a.id === parsed.bankAccountId);
    if (!account) return { ok: false, error: 'That bank account was not found.' };

    // A statement line is taken from the source, not from the request.
    let line: BankLine = { id: 'typed', ...parsed };
    let lines: BankLine[] = [line];
    if (parsed.lineId) {
      if (!bank.statementLines) {
        return { ok: false, error: `${source} doesn't share bank statement lines.` };
      }
      lines = await bank.statementLines(account.id);
      const found = lines.find((l) => l.id === parsed.lineId);
      if (!found) return { ok: false, error: 'That statement line is no longer there.' };
      line = found;
    }

    const invoice = await connector.invoices.get(parsed.invoiceId);
    if (invoice.type !== (line.direction === 'in' ? 'sales' : 'purchase')) {
      return {
        ok: false,
        error:
          line.direction === 'in'
            ? 'Money in can only be matched to a sales invoice.'
            : 'Money out can only be matched to a bill.',
      };
    }
    if (!canPay(connector, invoice.type)) {
      return { ok: false, error: `${source} doesn't let Bookie record this payment.` };
    }
    const lineCurrency = line.currency || account.currency;
    if (!lineCurrency || lineCurrency.toUpperCase() !== invoice.currency?.toUpperCase()) {
      return {
        ok: false,
        error: `${invoice.number} is in ${invoice.currency || 'an unknown currency'} and this account is in ${lineCurrency || 'an unknown currency'}. Bookie doesn't match across currencies.`,
      };
    }
    if (
      invoice.amountDue === undefined ||
      Math.abs(invoice.amountDue - parsed.expectedAmountDue) > 0.005
    ) {
      return {
        ok: false,
        error: `The amount due on ${invoice.number} has changed since this page loaded. Reload the page to see it.`,
      };
    }

    const entries = await unreconciledEntries(connector, account, lines);
    if (!entries) {
      return {
        ok: false,
        error: `Bookie couldn't read all of this account's transactions in ${source}, so it can't check the payment isn't already recorded.`,
      };
    }
    const paid = paidAlready(line, invoice, entries);
    if (paid) {
      return {
        ok: false,
        error: `A ${formatMoney(paid.amount, invoice.currency)} payment on ${invoice.number} dated ${formatDate(paid.date)} is already recorded. Reconcile it in ${source}.`,
      };
    }
    if (parsed.lineId && assignRecorded(lines, entries).has(line.id)) {
      return {
        ok: false,
        error: `This statement line is already in the books. Reconcile it in ${source}.`,
      };
    }
    if (!parsed.lineId && findRecorded(line, entries) && !parsed.acknowledgeSimilar) {
      return {
        ok: false,
        error: 'Something for this amount is already in the books. Check it before matching.',
      };
    }

    const result = await recordPayment(orgKey, {
      invoiceId: invoice.id,
      bankAccountId: account.id,
      date: line.date,
      amount: line.amount,
      reference: line.reference || undefined,
    });
    return result.ok ? { ok: true, data: { paymentId: result.data.id } } : result;
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
