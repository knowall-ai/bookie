'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { allocateCreditNote } from '@/lib/portal/actions/allocations';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface AllocatableDocument {
  id: string;
  number: string;
  date: string;
  dueDate?: string;
  amountDue: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Xero's "Allocate credit" box: apply remaining credit to an outstanding invoice or bill. */
export function AllocateCreditPanel({
  orgKey,
  creditNoteId,
  creditNumber,
  remainingCredit,
  currency,
  documents,
  noun,
  preselect,
}: {
  orgKey: string;
  creditNoteId: string;
  creditNumber: string;
  remainingCredit: number;
  currency: string;
  documents: AllocatableDocument[];
  /** "invoice" or "bill". */
  noun: string;
  preselect?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial =
    documents.find((d) => d.id === preselect) ??
    (documents.length === 1 ? documents[0] : undefined);
  const [invoiceId, setInvoiceId] = useState(initial?.id ?? '');
  const [amount, setAmount] = useState(
    initial ? round(Math.min(remainingCredit, initial.amountDue)).toFixed(2) : ''
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const doc = documents.find((d) => d.id === invoiceId);
  const value = Number(amount);
  const max = doc ? round(Math.min(remainingCredit, doc.amountDue)) : remainingCredit;

  const choose = (id: string) => {
    setInvoiceId(id);
    const next = documents.find((d) => d.id === id);
    if (next) setAmount(round(Math.min(remainingCredit, next.amountDue)).toFixed(2));
  };

  const validate = () => {
    if (!doc) return `Choose the ${noun} to allocate to.`;
    if (!(value > 0)) return 'Enter an amount above zero.';
    if (value > max + 0.005) return `The amount can't be more than ${formatMoney(max, currency)}.`;
    if (!date) return 'Enter the allocation date.';
    return null;
  };

  const submit = () =>
    start(async () => {
      const result = await allocateCreditNote(orgKey, creditNoteId, {
        invoiceId,
        amount: round(value),
        date,
      });
      setConfirming(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Credit allocated');
      router.refresh();
    });

  return (
    <section
      id="allocate"
      aria-labelledby="allocate-heading"
      className="card p-5"
      data-testid="allocate-panel"
    >
      <h2 id="allocate-heading" className="text-ink text-sm font-semibold">
        Allocate credit
      </h2>
      <p className="text-muted mt-1 text-sm">
        {formatMoney(remainingCredit, currency)} remaining to allocate to an outstanding {noun} for
        this contact.
      </p>
      {documents.length === 0 ? (
        <p className="text-muted mt-4 text-sm" data-testid="allocate-none">
          This contact has no outstanding {noun}s in {currency} to allocate to.
        </p>
      ) : (
        <form
          className="mt-4 grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const problem = validate();
            setError(problem);
            if (!problem) setConfirming(true);
          }}
        >
          <Field
            label={noun === 'bill' ? 'Bill' : 'Invoice'}
            htmlFor="alloc-invoice"
            className="sm:col-span-3"
          >
            <Select
              id="alloc-invoice"
              value={invoiceId}
              onChange={(e) => choose(e.target.value)}
              data-testid="allocate-invoice"
            >
              <option value="">Choose…</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.number || '(no number)'} · {formatDate(d.date)} ·{' '}
                  {formatMoney(d.amountDue, currency)} due
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount to allocate" htmlFor="alloc-amount">
            <Input
              id="alloc-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={max}
              className="num"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-testid="allocate-amount"
            />
          </Field>
          <Field label="Date" htmlFor="alloc-date">
            <Input
              id="alloc-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <div className="flex items-end justify-end">
            <Button
              type="submit"
              variant="primary"
              disabled={pending}
              data-testid="allocate-submit"
            >
              Allocate credit
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-danger text-sm sm:col-span-3">
              {error}
            </p>
          )}
        </form>
      )}
      {confirming && doc && (
        <ConfirmDialog
          title="Allocate this credit?"
          body={
            <>
              {formatMoney(value, currency)} from credit note{' '}
              <span className="text-ink">{creditNumber}</span> is applied to {noun}{' '}
              <span className="text-ink">{doc.number}</span> on {formatDate(date)}. This writes to
              your live books.
            </>
          }
          cta="Allocate"
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={submit}
        />
      )}
    </section>
  );
}
