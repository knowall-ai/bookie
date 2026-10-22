'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { matchBankLine } from '@/lib/portal/actions/reconcile';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** "Match" on a Reconcile suggestion: confirm, then record the payment. */
export function MatchButton({
  orgKey,
  bankAccountId,
  bankAccountName,
  lineId,
  expectedAmountDue,
  similar,
  line,
  document,
  sourceName,
  afterPayment,
  reconcileUrl,
}: {
  orgKey: string;
  bankAccountId: string;
  bankAccountName: string;
  /** The statement line's id, when the line came from the source. */
  lineId?: string;
  /** The amount due the page showed, re-checked on the server. */
  expectedAmountDue: number;
  /** An entry already in the books for this amount ("payment for INV-0042 on 3 Oct 2026"). */
  similar?: string;
  line: {
    direction: 'in' | 'out';
    date: string;
    amount: number;
    currency: string;
    reference?: string;
  };
  document: { id: string; number: string; contactName: string; kind: 'invoice' | 'bill' };
  sourceName: string;
  afterPayment: string;
  reconcileUrl?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const amount = formatMoney(line.amount, line.currency);

  const confirm = () =>
    start(async () => {
      const result = await matchBankLine(orgKey, {
        invoiceId: document.id,
        bankAccountId,
        lineId,
        expectedAmountDue,
        acknowledgeSimilar: !!similar,
        direction: line.direction,
        date: line.date,
        amount: line.amount,
        reference: line.reference,
      });
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDone(true);
      toast.success(`Payment recorded against ${document.number}`);
      router.refresh();
    });

  if (done) {
    return (
      <p className="text-body text-sm" role="status" data-testid="match-done">
        Payment recorded against {document.number}. {afterPayment}{' '}
        {reconcileUrl && (
          <a href={reconcileUrl} target="_blank" rel="noreferrer" className="text-brand underline">
            Reconcile in {sourceName}
          </a>
        )}
      </p>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="primary"
        onClick={() => setConfirming(true)}
        aria-label={`Match ${document.number}`}
        data-testid={`match-${document.number}`}
      >
        Match
      </Button>
      {confirming && (
        <ConfirmDialog
          title={`Record a payment against ${document.number}?`}
          cta="Record payment"
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={confirm}
          body={
            <div className="space-y-2">
              <p>
                Bookie will record a {amount} payment against {document.kind} {document.number} (
                {document.contactName}), {line.direction === 'in' ? 'into' : 'from'}{' '}
                {bankAccountName}, dated {formatDate(line.date)}, in {sourceName}.
              </p>
              {similar && (
                <p className="text-warn">
                  Already in the books for this amount: {similar}. Record this payment as well only
                  if it is a different payment.
                </p>
              )}
              <p>{afterPayment}</p>
            </div>
          }
        />
      )}
    </>
  );
}
