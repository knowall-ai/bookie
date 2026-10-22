import type { ReconcileGuide } from '../../types';
import { xeroDeepLink } from '../index';

/**
 * Xero's Accounting API has no statement lines and no way to reconcile one:
 * `Reports/BankStatement` answers 401 to this connection, and the Finance API's
 * `BankStatementsPlus` is restricted to approved lending partners. A payment
 * created with `IsReconciled: true` is only flagged as reconciled; it isn't
 * matched to the feed line, which would stay in Reconcile, so Bookie never sets
 * it. What the API can do is record the payment; Xero then offers it as the
 * match for the statement line in its own Reconcile screen.
 */
export function xeroReconcile(shortCode?: string): ReconcileGuide {
  return {
    statementLinesNote:
      "Xero's API doesn't share bank statement lines, so Bookie can't list them here. Enter a line from your statement in Find & match to find the invoice or bill it pays.",
    afterPayment:
      "Xero's API can record the payment but can't reconcile a statement line. Xero now shows the payment as a suggested match for the statement line in its Reconcile screen: open it there and click OK.",
    url: (account) => xeroDeepLink(shortCode, `/Bank/BankRec.aspx?accountID=${account.id}`),
  };
}
