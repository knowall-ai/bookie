'use server';

import { z } from 'zod';
import { orgContext, sourceName } from '@/lib/portal/context';
import { canPay, unreconciledEntries } from '@/lib/portal/reconcile';
import { findRecorded } from '@/lib/reconcile/match';
import { recordPayment } from './payments';
import { describeError, isoDate, type ActionResult } from './util';

const matchSchema = z.object({
  invoiceId: z.string().min(1),
  bankAccountId: z.string().min(1),
  direction: z.enum(['in', 'out']),
  date: isoDate,
  amount: z.coerce.number().finite().positive('The line has no amount to match.'),
  reference: z.string().trim().max(255).optional(),
});

export type MatchInput = z.input<typeof matchSchema>;

/**
 * Reconcile's "Match": record a payment against an open invoice or bill from
 * this bank account, for the bank line's amount and date. Re-checks
 * everything the suggestion showed (direction, currency, nothing already
 * recorded), then records the payment through `recordPayment`, which re-reads
 * the amount due. The UI confirms first.
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
    const invoice = await connector.invoices.get(parsed.invoiceId);
    const expected = parsed.direction === 'in' ? 'sales' : 'purchase';
    if (invoice.type !== expected) {
      return {
        ok: false,
        error:
          parsed.direction === 'in'
            ? 'Money in can only be matched to a sales invoice.'
            : 'Money out can only be matched to a bill.',
      };
    }
    if (!canPay(connector, invoice.type)) {
      return { ok: false, error: `${source} doesn't let Bookie record this payment.` };
    }
    if (!account.currency || account.currency.toUpperCase() !== invoice.currency?.toUpperCase()) {
      return {
        ok: false,
        error: `${invoice.number} is in ${invoice.currency || 'an unknown currency'} and this account is in ${account.currency || 'an unknown currency'}. Bookie doesn't match across currencies.`,
      };
    }
    const line = { id: 'match', ...parsed };
    const entries = await unreconciledEntries(connector, account, [line]);
    if (!entries) {
      return {
        ok: false,
        error: `Bookie couldn't read this account's transactions in ${source}, so it can't check the payment isn't already recorded.`,
      };
    }
    if (findRecorded(line, entries)) {
      return {
        ok: false,
        error: `A payment for this amount is already recorded in ${source}. Reconcile it there.`,
      };
    }
    const result = await recordPayment(orgKey, {
      invoiceId: invoice.id,
      bankAccountId: account.id,
      date: parsed.date,
      amount: parsed.amount,
      reference: parsed.reference || undefined,
    });
    return result.ok ? { ok: true, data: { paymentId: result.data.id } } : result;
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}
