'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ArrowRight } from 'lucide-react';
import type { BankTransferInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { BankOption } from './BankTransactionForm';

/** Xero's "Transfer money" form: from one bank account to another, same currency. */
export function TransferForm({
  bankAccounts,
  initialFromId,
  save,
  cancelHref,
  savedHref,
}: {
  bankAccounts: BankOption[];
  initialFromId?: string;
  save: (input: BankTransferInput) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
  savedHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromId, setFromId] = useState(initialFromId ?? bankAccounts[0]?.value ?? '');
  const [toId, setToId] = useState(
    bankAccounts.find((b) => b.value !== (initialFromId ?? bankAccounts[0]?.value))?.value ?? ''
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');

  const from = bankAccounts.find((b) => b.value === fromId);
  const to = bankAccounts.find((b) => b.value === toId);
  const value = Math.round(Number(amount) * 100) / 100;

  const problem = !from
    ? 'Choose the account the money comes from.'
    : !to
      ? 'Choose the account the money goes to.'
      : from.value === to.value
        ? 'Choose two different bank accounts.'
        : from.currency !== to.currency
          ? `${from.label} is in ${from.currency} and ${to.label} in ${to.currency}. Transfers between currencies need an exchange rate; record this one in your accounting system.`
          : !date
            ? 'Enter the date of the transfer.'
            : !(value > 0)
              ? 'Enter an amount above zero.'
              : null;

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await save({
        fromBankAccountId: fromId,
        toBankAccountId: toId,
        date,
        amount: value,
        reference: reference.trim() || undefined,
      });
      setConfirm(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Transfer saved');
      router.push(savedHref);
      router.refresh();
    });

  return (
    <form
      className="space-y-5"
      aria-labelledby="transfer-title"
      onSubmit={(e) => {
        e.preventDefault();
        setError(problem);
        if (!problem) setConfirm(true);
      }}
    >
      <h1 id="transfer-title" className="text-ink text-2xl font-bold tracking-tight">
        Transfer money
      </h1>
      <div className="card grid gap-5 p-5 md:grid-cols-[1fr_auto_1fr]">
        <Field label="From" htmlFor="transfer-from">
          <Select
            id="transfer-from"
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            data-testid="transfer-from"
          >
            {bankAccounts.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label} ({b.currency})
              </option>
            ))}
          </Select>
        </Field>
        <ArrowRight
          className="text-faint hidden h-5 w-5 self-center md:mt-6 md:block"
          aria-hidden
        />
        <Field label="To" htmlFor="transfer-to">
          <Select
            id="transfer-to"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            data-testid="transfer-to"
          >
            <option value="">Choose an account…</option>
            {bankAccounts.map((b) => (
              <option key={b.value} value={b.value} disabled={b.value === fromId}>
                {b.label} ({b.currency})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-5 sm:grid-cols-3 md:col-span-3">
          <Field label="Date" htmlFor="transfer-date">
            <Input
              id="transfer-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label={`Amount${from ? ` (${from.currency})` : ''}`} htmlFor="transfer-amount">
            <Input
              id="transfer-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              className="num"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="transfer-amount"
            />
          </Field>
          <Field label="Reference" htmlFor="transfer-reference">
            <Input
              id="transfer-reference"
              value={reference}
              maxLength={255}
              onChange={(e) => setReference(e.target.value)}
              data-testid="transfer-reference"
            />
          </Field>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending} data-testid="transfer-save">
          Save transfer
        </Button>
      </div>
      {confirm && from && to && (
        <ConfirmDialog
          title="Transfer this money?"
          body={
            <>
              {formatMoney(value, from.currency)} from{' '}
              <span className="text-ink">{from.label}</span> to{' '}
              <span className="text-ink">{to.label}</span> on {formatDate(date)}. This posts a
              transfer to your live books.
            </>
          }
          cta="Transfer"
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </form>
  );
}
