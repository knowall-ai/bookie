'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { recordPayment } from '@/lib/portal/actions/payments';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface PaymentBankOption {
  id: string;
  name: string;
  code?: string;
}

/** Xero's "Make a payment" box under an approved invoice or bill. */
export function PaymentPanel({
  orgKey,
  invoiceId,
  amountDue,
  currency,
  bankAccounts,
  isSales,
}: {
  orgKey: string;
  invoiceId: string;
  amountDue: number;
  currency: string;
  bankAccounts: PaymentBankOption[];
  isSales: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(amountDue.toFixed(2));
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState(
    bankAccounts.length === 1 ? bankAccounts[0].id : ''
  );
  const [reference, setReference] = useState('');

  const value = Number(amount);
  const bank = bankAccounts.find((b) => b.id === bankAccountId);

  const validate = () => {
    if (!(value > 0)) return 'Enter an amount above zero.';
    if (value > amountDue + 0.005)
      return `The amount can't be more than the ${formatMoney(amountDue, currency)} due.`;
    if (!date) return 'Enter the date paid.';
    if (!bank) return `Choose the account it was paid ${isSales ? 'into' : 'from'}.`;
    return null;
  };

  const submit = () =>
    start(async () => {
      const result = await recordPayment(orgKey, {
        invoiceId,
        bankAccountId,
        date,
        amount: Math.round(value * 100) / 100,
        reference: reference.trim() || undefined,
      });
      setConfirming(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Payment recorded');
      router.refresh();
    });

  return (
    <section aria-labelledby="payment-heading" className="card p-5" data-testid="payment-panel">
      <h2 id="payment-heading" className="text-ink text-sm font-semibold">
        Make a payment
      </h2>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = validate();
          setError(problem);
          if (!problem) setConfirming(true);
        }}
      >
        <Field label="Amount paid" htmlFor="pay-amount">
          <Input
            id="pay-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={amountDue}
            className="num"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="payment-amount"
          />
        </Field>
        <Field label="Date paid" htmlFor="pay-date">
          <Input id="pay-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={isSales ? 'Paid to' : 'Paid from'} htmlFor="pay-bank">
          <Select
            id="pay-bank"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            data-testid="payment-bank"
          >
            <option value="">Choose an account…</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} · ${b.name}` : b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="pay-ref">
          <Input
            id="pay-ref"
            value={reference}
            maxLength={255}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-danger text-sm sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" variant="primary" disabled={pending} data-testid="payment-add">
            Add payment
          </Button>
        </div>
      </form>
      {confirming && bank && (
        <ConfirmDialog
          title="Record this payment?"
          body={
            <>
              {formatMoney(value, currency)} {isSales ? 'received into' : 'paid from'}{' '}
              <span className="text-ink">{bank.name}</span> on {formatDate(date)}. This writes a
              payment to your live books.
            </>
          }
          cta="Record payment"
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        />
      )}
    </section>
  );
}
