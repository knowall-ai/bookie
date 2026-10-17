'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { recordPayment } from '@/lib/portal/actions/payments';
import { formatDate, formatMoney, formatNumber } from '@/lib/ui/format';
import { isForeign } from '@/lib/domain/currency';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface PaymentBankOption {
  id: string;
  name: string;
  code?: string;
  currency?: string;
}

/** Xero's "Make a payment" box under an approved invoice or bill. */
export function PaymentPanel({
  orgKey,
  invoiceId,
  amountDue,
  currency,
  bankAccounts: allBankAccounts,
  isSales,
  baseCurrency,
  invoiceRate,
  acceptsRate,
}: {
  orgKey: string;
  invoiceId: string;
  amountDue: number;
  /** The document's currency: the amount paid is entered in it, as in Xero. */
  currency: string;
  bankAccounts: PaymentBankOption[];
  isSales: boolean;
  baseCurrency?: string;
  /** The document's own source exchange rate, shown for reference. */
  invoiceRate?: number;
  /** The source takes a payment exchange rate (Xero CurrencyRate). */
  acceptsRate?: boolean;
}) {
  // A foreign-currency document can be paid from an account in its own currency
  // or in the base currency, as Xero allows; hide accounts in any other currency.
  const bankAccounts = allBankAccounts.filter(
    (b) => !b.currency || !baseCurrency || b.currency === currency || b.currency === baseCurrency
  );
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
  const [rate, setRate] = useState('');

  const value = Number(amount);
  const bank = bankAccounts.find((b) => b.id === bankAccountId);
  const foreign = !!baseCurrency && isForeign(currency, baseCurrency);
  // Paying a foreign document from a base-currency account converts at a rate.
  const converts = foreign && !!bank && (!bank.currency || bank.currency !== currency);
  const rateValue = rate ? Number(rate) : undefined;

  const validate = () => {
    if (!(value > 0)) return 'Enter an amount above zero.';
    if (value > amountDue + 0.005)
      return `The amount can't be more than the ${formatMoney(amountDue, currency)} due.`;
    if (!date) return 'Enter the date paid.';
    if (!bank) return `Choose the account it was paid ${isSales ? 'into' : 'from'}.`;
    if (rateValue !== undefined && !(rateValue > 0)) return 'The exchange rate must be above zero.';
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
        currencyRate: converts && acceptsRate ? rateValue : undefined,
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
        <Field label={foreign ? `Amount paid (${currency})` : 'Amount paid'} htmlFor="pay-amount">
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
                {foreign && b.currency ? ` (${b.currency})` : ''}
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
        {converts && acceptsRate && (
          <Field
            label="Exchange rate"
            htmlFor="pay-rate"
            hint={`${currency} per 1 ${baseCurrency}.${
              invoiceRate ? ` Invoice rate ${formatNumber(invoiceRate, 4)}.` : ''
            } Leave blank to let your accounting system set it.`}
          >
            <Input
              id="pay-rate"
              type="number"
              step="any"
              min="0"
              className="num"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              data-testid="payment-rate"
            />
          </Field>
        )}
        {converts && rateValue !== undefined && rateValue > 0 && value > 0 && (
          <p className="text-muted self-end pb-2 text-sm" data-testid="payment-base">
            {formatMoney(value / rateValue, baseCurrency)} at this rate
          </p>
        )}
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
