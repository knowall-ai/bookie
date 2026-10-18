import type { BankAccount } from '@/lib/domain/types';
import type { ReconcileGuide } from '../../types';

/**
 * Business Central's API v2.0 has no bank statement, bank account
 * reconciliation or payment reconciliation journal entity, so statement lines
 * can't be read and nothing can be reconciled from the API. With the Bookie BC
 * extension a customer payment can be registered (posted) to a local-currency
 * bank account; bills are paid in Business Central with a payment journal.
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
      : "Business Central's API can't post a payment to a bank account without the Bookie BC extension. Record the payment and reconcile the statement in Business Central.",
    url: link,
  };
}
