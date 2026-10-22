import type { BankAccount } from '@/lib/domain/types';
import type { ReconcileGuide } from '../../types';

/**
 * Business Central's API v2.0 has no bank statement, bank account
 * reconciliation or payment reconciliation journal entity, so statement lines
 * can't be read and nothing can be reconciled from the API. Its customer and
 * vendor payment journals take lines and can be posted, but they balance
 * against the batch's account and post every line in the batch, so Bookie
 * doesn't use them (see ./payments). With the Bookie BC extension a customer
 * payment can be registered (posted) to a chosen local-currency bank account;
 * bills are paid in Business Central with a payment journal.
 * The bank entry is then matched to the statement in BC's own Bank Account
 * Reconciliation (page 388) or Payment Reconciliation Journal.
 */
export function bcReconcile(
  link: (account: BankAccount) => string | undefined,
  extension: boolean
): ReconcileGuide {
  return {
    statementLinesNote:
      "Business Central's API has no bank statement or bank reconciliation entity, so Bookie can't list statement lines here. Enter a line from your statement in Find & match to find the invoice it pays.",
    afterPayment: extension
      ? "Bookie registers the customer payment and posts it to this bank account in Business Central. Business Central's API can't reconcile it: import the bank statement in Bank Account Reconciliation (or a Payment Reconciliation Journal), match the new bank entry and post the reconciliation there."
      : "Without the Bookie BC extension, Business Central's API only adds payment journal lines, which balance against the journal batch's own account (not one chosen per payment) and post with the whole batch, so Bookie doesn't record payments here. Record the payment and reconcile the statement in Business Central.",
    url: link,
  };
}
