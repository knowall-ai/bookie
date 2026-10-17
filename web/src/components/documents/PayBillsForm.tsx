'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { BatchPaymentInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, inputClass } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface PayableBill {
  id: string;
  number: string;
  reference?: string;
  supplier: string;
  dueDate?: string;
  isOverdue: boolean;
  currency: string;
  /** Undefined when the source didn't say what is due: such bills can't be selected. */
  amountDue?: number;
}

export interface PayFromAccount {
  id: string;
  name: string;
  code?: string;
  currency: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Xero's batch payment screen: pick approved bills, one bank account, one date, one reference. */
export function PayBillsForm({
  bills,
  bankAccounts,
  referenceMax,
  referenceHint,
  save,
  cancelHref,
  savedHref,
}: {
  bills: PayableBill[];
  bankAccounts: PayFromAccount[];
  referenceMax: number;
  referenceHint?: string;
  save: (input: BatchPaymentInput) => Promise<ActionResult<{ id: string; count: number }>>;
  cancelHref: string;
  savedHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bankAccountId, setBankAccountId] = useState(
    bankAccounts.length === 1 ? bankAccounts[0].id : ''
  );
  const [reference, setReference] = useState('');
  const [selected, setSelected] = useState<Record<string, string>>({});

  const payable = bills.filter((b) => typeof b.amountDue === 'number' && b.amountDue > 0);
  const chosen = payable.filter((b) => selected[b.id] !== undefined);
  const bank = bankAccounts.find((b) => b.id === bankAccountId);
  const currencies = [...new Set(chosen.map((b) => b.currency))];
  const total = r2(chosen.reduce((s, b) => s + (Number(selected[b.id]) || 0), 0));

  const toggle = (bill: PayableBill, on: boolean) =>
    setSelected((s) => {
      const next = { ...s };
      if (on) next[bill.id] = (bill.amountDue ?? 0).toFixed(2);
      else delete next[bill.id];
      return next;
    });
  const allOn = payable.length > 0 && chosen.length === payable.length;

  const problem =
    chosen.length === 0
      ? 'Choose at least one bill to pay.'
      : currencies.length > 1
        ? 'Pay bills in one currency at a time.'
        : !bank
          ? 'Choose the account to pay from.'
          : bank.currency !== currencies[0]
            ? `${bank.name} is a ${bank.currency} account; these bills are in ${currencies[0]}.`
            : !date
              ? 'Enter the payment date.'
              : chosen.some((b) => {
                    const v = Number(selected[b.id]);
                    return !(v > 0) || v > (b.amountDue ?? 0) + 0.005;
                  })
                ? 'Each payment must be above zero and no more than the amount due.'
                : null;

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await save({
        bankAccountId,
        date,
        reference: reference.trim() || undefined,
        payments: chosen.map((b) => ({ invoiceId: b.id, amount: r2(Number(selected[b.id])) })),
      });
      setConfirm(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.count} ${result.data.count === 1 ? 'bill' : 'bills'} paid`);
      router.push(savedHref);
      router.refresh();
    });

  const currency = currencies[0] ?? bank?.currency;
  return (
    <form
      className="space-y-5"
      aria-labelledby="pay-bills-title"
      onSubmit={(e) => {
        e.preventDefault();
        setError(problem);
        if (!problem) setConfirm(true);
      }}
    >
      <h1 id="pay-bills-title" className="text-ink text-2xl font-bold tracking-tight">
        Pay bills
      </h1>
      <div className="card grid gap-5 p-5 sm:grid-cols-3">
        <Field label="Payment date" htmlFor="batch-date">
          <Input
            id="batch-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Pay from" htmlFor="batch-bank">
          <Select
            id="batch-bank"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            data-testid="batch-bank"
          >
            <option value="">Choose an account…</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code ? `${b.code} · ${b.name}` : b.name} ({b.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="batch-reference" hint={referenceHint}>
          <Input
            id="batch-reference"
            value={reference}
            maxLength={referenceMax}
            onChange={(e) => setReference(e.target.value)}
            data-testid="batch-reference"
          />
        </Field>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-line bg-surface-2/60 border-b">
                <th scope="col" className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    aria-label="Select all bills"
                    className="accent-brand h-4 w-4"
                    checked={allOn}
                    onChange={(e) => payable.forEach((b) => toggle(b, e.target.checked))}
                  />
                </th>
                {['From', 'Number', 'Due date', 'Amount due', 'Payment'].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={cn(
                      'text-muted px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase',
                      i >= 3 ? 'text-right' : 'text-left',
                      (h === 'Number' || h === 'Due date') && 'hidden md:table-cell'
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bills.map((bill) => {
                const known = typeof bill.amountDue === 'number';
                const on = selected[bill.id] !== undefined;
                return (
                  <tr
                    key={bill.id}
                    className="border-line/70 border-b last:border-0"
                    data-testid="batch-row"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Pay ${bill.number || 'bill'} from ${bill.supplier}`}
                        className="accent-brand h-4 w-4"
                        checked={on}
                        disabled={!known || !(bill.amountDue! > 0)}
                        onChange={(e) => toggle(bill, e.target.checked)}
                        data-testid={`batch-select-${bill.number}`}
                      />
                    </td>
                    <td className="text-ink px-4 py-3">{bill.supplier}</td>
                    <td className="text-body hidden px-4 py-3 md:table-cell">
                      {bill.number || '—'}
                    </td>
                    <td
                      className={cn(
                        'hidden px-4 py-3 md:table-cell',
                        bill.isOverdue ? 'text-danger font-medium' : 'text-body'
                      )}
                    >
                      {formatDate(bill.dueDate)}
                    </td>
                    <td className="text-ink num px-4 py-3 text-right whitespace-nowrap">
                      {known ? (
                        formatMoney(bill.amountDue, bill.currency)
                      ) : (
                        <span className="text-muted text-xs">Not available</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={bill.amountDue}
                        aria-label={`Payment for ${bill.number || bill.supplier}`}
                        className={cn(inputClass, 'num ml-auto h-9 w-32 text-right')}
                        disabled={!on}
                        value={on ? selected[bill.id] : ''}
                        onChange={(e) => setSelected((s) => ({ ...s, [bill.id]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-line bg-surface-2/40 border-t">
                <td colSpan={2} className="text-muted px-4 py-3 text-sm" data-testid="batch-count">
                  {chosen.length} of {payable.length} {payable.length === 1 ? 'bill' : 'bills'}{' '}
                  selected
                </td>
                <td colSpan={2} className="hidden md:table-cell" />
                <td className="text-muted px-4 py-3 text-right text-sm font-semibold">Total</td>
                <td
                  className="text-ink num px-4 py-3 text-right text-base font-semibold"
                  data-testid="batch-total"
                >
                  {formatMoney(total, currency)}
                </td>
              </tr>
            </tfoot>
          </table>
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
        <Button type="submit" variant="primary" disabled={pending} data-testid="batch-pay">
          Make payments
        </Button>
      </div>
      {confirm && bank && (
        <ConfirmDialog
          title={`Pay ${chosen.length} ${chosen.length === 1 ? 'bill' : 'bills'}?`}
          body={
            <>
              {formatMoney(total, currency)} paid from <span className="text-ink">{bank.name}</span>{' '}
              on {formatDate(date)} as one batch payment. This records a payment against each bill
              in your live books.
            </>
          }
          cta="Make payments"
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </form>
  );
}
