'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { BankTransactionInput, LineAmountType, LineItemInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, inputClass } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  editorTotals,
  type EditorOption,
  type EditorTaxRate,
} from '@/components/documents/DocumentEditor';

export interface BankOption {
  value: string;
  label: string;
  currency: string;
}

const blankLine = (): LineItemInput => ({ description: '', quantity: 1, unitAmount: 0 });

const lineAmount = (l: LineItemInput) => Math.round(l.quantity * l.unitAmount * 100) / 100;

/** Xero's "Spend money" / "Receive money" form. Both post straight to the bank account. */
export function BankTransactionForm({
  bankAccounts,
  contacts,
  accounts,
  taxRates,
  initialType,
  initialBankAccountId,
  save,
  cancelHref,
  savedHref,
}: {
  bankAccounts: BankOption[];
  contacts: EditorOption[];
  accounts: EditorOption[];
  taxRates: EditorTaxRate[];
  initialType: 'spend' | 'receive';
  initialBankAccountId?: string;
  save: (
    input: BankTransactionInput
  ) => Promise<ActionResult<{ id: string; bankAccountId: string }>>;
  cancelHref: string;
  /** Bank account register path; the bank account id is appended. */
  savedHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState(initialType);
  const [bankAccountId, setBankAccountId] = useState(
    initialBankAccountId ?? bankAccounts[0]?.value ?? ''
  );
  const [contactId, setContactId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [lineAmountType, setLineAmountType] = useState<LineAmountType>('inclusive');
  const [lines, setLines] = useState<LineItemInput[]>([blankLine()]);

  const currency = bankAccounts.find((b) => b.value === bankAccountId)?.currency ?? '';
  // Tax is only previewed from rates the source gave us; see editorTotals.
  const totals = useMemo(() => {
    const rates = new Map(taxRates.map((t) => [t.taxType, t.rate]));
    return editorTotals(lines, lineAmountType, (taxType) => rates.get(taxType));
  }, [lines, lineAmountType, taxRates]);
  const preview = totals.preview;
  const taxed = lineAmountType !== 'none';
  // Tax-inclusive lines add up to the amount paid, whatever the tax turns out to be.
  const knownTotal =
    preview?.total ?? (lineAmountType === 'inclusive' ? totals.lineSum : undefined);

  const setLine = (index: number, patch: Partial<LineItemInput>) =>
    setLines((all) => all.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const filled = lines.filter((l) => l.description || l.unitAmount);
  const problem = !bankAccountId
    ? 'Choose a bank account.'
    : !contactId
      ? `Choose who the money is ${type === 'spend' ? 'paid to' : 'received from'}.`
      : filled.length === 0 || totals.lineSum === 0
        ? 'Enter at least one line with an amount.'
        : filled.some((l) => !l.accountCode)
          ? 'Choose an account on every line.'
          : null;

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await save({
        bankAccountId,
        type,
        contactId,
        date,
        reference: reference || undefined,
        lineAmountType,
        lineItems: filled,
      });
      setConfirm(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(type === 'spend' ? 'Spend money saved' : 'Receive money saved');
      router.push(`${savedHref}/${encodeURIComponent(result.data.bankAccountId)}`);
      router.refresh();
    });

  const noun = type === 'spend' ? 'Spend money' : 'Receive money';
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) setConfirm(true);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-ink text-2xl font-bold tracking-tight">{noun}</h1>
        <div
          role="radiogroup"
          aria-label="Transaction type"
          className="bg-surface-2 border-line-strong inline-flex rounded-lg border p-1"
        >
          {(['spend', 'receive'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => setType(t)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                type === t ? 'bg-brand text-brand-ink font-semibold' : 'text-muted hover:text-ink'
              )}
            >
              {t === 'spend' ? 'Spend money' : 'Receive money'}
            </button>
          ))}
        </div>
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-7">
        <Field label="Bank account" htmlFor="bank-account" className="lg:col-span-2">
          <Select
            id="bank-account"
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            required
            data-testid="bank-account"
          >
            {bankAccounts.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={type === 'spend' ? 'To' : 'From'}
          htmlFor="bank-contact"
          className="lg:col-span-2"
        >
          <Select
            id="bank-contact"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            required
            data-testid="bank-contact"
          >
            <option value="">Choose…</option>
            {contacts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date" htmlFor="bank-date">
          <Input
            id="bank-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        <Field label="Reference" htmlFor="bank-reference">
          <Input
            id="bank-reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field label="Amounts are" htmlFor="bank-lat">
          <Select
            id="bank-lat"
            value={lineAmountType}
            onChange={(e) => setLineAmountType(e.target.value as LineAmountType)}
          >
            <option value="inclusive">Tax inclusive</option>
            <option value="exclusive">Tax exclusive</option>
            <option value="none">No tax</option>
          </Select>
        </Field>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-line bg-surface-2/60 text-muted border-b text-xs font-semibold tracking-wide uppercase">
              <th className="px-3 py-3 text-left">Description</th>
              <th className="w-20 px-3 py-3 text-right">Qty</th>
              <th className="w-32 px-3 py-3 text-right">Price</th>
              <th className="w-56 px-3 py-3 text-left">Account</th>
              {lineAmountType !== 'none' && <th className="w-44 px-3 py-3 text-left">Tax rate</th>}
              <th className="w-32 px-3 py-3 text-right">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="border-line/70 border-b last:border-0">
                <td className="px-2 py-2">
                  <input
                    aria-label="Description"
                    className={cn(inputClass, 'h-9 px-2')}
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    data-testid={`bank-line-${i}-description`}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label="Quantity"
                    type="number"
                    step="any"
                    className={cn(inputClass, 'num h-9 px-2 text-right')}
                    value={line.quantity}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label="Unit price"
                    type="number"
                    step="any"
                    className={cn(inputClass, 'num h-9 px-2 text-right')}
                    value={line.unitAmount}
                    onChange={(e) => setLine(i, { unitAmount: Number(e.target.value) })}
                    data-testid={`bank-line-${i}-price`}
                  />
                </td>
                <td className="px-2 py-2">
                  {accounts.length > 0 ? (
                    <select
                      aria-label="Account"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.accountCode ?? ''}
                      onChange={(e) => setLine(i, { accountCode: e.target.value || undefined })}
                      data-testid={`bank-line-${i}-account`}
                    >
                      <option value="">Choose…</option>
                      {accounts.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label="Account code"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.accountCode ?? ''}
                      onChange={(e) => setLine(i, { accountCode: e.target.value || undefined })}
                      data-testid={`bank-line-${i}-account`}
                    />
                  )}
                </td>
                {lineAmountType !== 'none' && (
                  <td className="px-2 py-2">
                    <select
                      aria-label="Tax rate"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.taxType ?? ''}
                      onChange={(e) => setLine(i, { taxType: e.target.value || undefined })}
                    >
                      <option value="">No tax</option>
                      {taxRates.map((t) => (
                        <option key={t.taxType} value={t.taxType}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="num text-ink px-3 py-3 text-right">
                  {formatMoney(lineAmount(line))}
                </td>
                <td className="px-1 py-2">
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="text-faint hover:text-danger flex h-9 w-8 items-center justify-center disabled:opacity-30"
                    disabled={lines.length === 1}
                    onClick={() => setLines((all) => all.filter((_, n) => n !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-line border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLines((all) => [...all, blankLine()])}
          >
            <Plus className="h-4 w-4" /> Add a new line
          </Button>
        </div>
      </div>

      <dl className="ml-auto w-full max-w-sm space-y-2 text-sm" aria-label="Totals">
        {preview && (
          <>
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="num">{formatMoney(preview.subTotal, currency || undefined)}</dd>
            </div>
            {taxed && (
              <div className="flex justify-between">
                <dt className="text-muted">
                  {lineAmountType === 'inclusive' ? 'Includes tax' : 'Total tax'}{' '}
                  <span className="text-faint">(preview)</span>
                </dt>
                <dd className="num">{formatMoney(preview.tax, currency || undefined)}</dd>
              </div>
            )}
          </>
        )}
        <div className="border-line-strong text-ink flex justify-between border-t pt-2 text-base font-bold">
          <dt>{knownTotal === undefined ? 'Subtotal' : 'Total'}</dt>
          <dd className="num" data-testid="bank-total">
            {formatMoney(knownTotal ?? totals.lineSum, currency || undefined)}
          </dd>
        </div>
        {taxed && !preview && (
          <p className="text-faint text-xs">
            {lineAmountType === 'inclusive'
              ? 'Tax is calculated by your accounting system when you save.'
              : 'Tax and total are calculated by your accounting system when you save.'}
          </p>
        )}
      </dl>

      {error && (
        <p
          role="alert"
          className="bg-danger/10 text-danger border-danger/30 rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="bg-canvas/90 border-line sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {problem && <p className="text-faint mr-auto text-xs">{problem}</p>}
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !!problem}
          data-testid="bank-save"
        >
          Save
        </Button>
      </div>

      {confirm && (
        <ConfirmDialog
          title={`Save this ${noun.toLowerCase()} transaction?`}
          body={`This records ${knownTotal === undefined ? 'the amount' : formatMoney(knownTotal, currency || undefined)} ${type === 'spend' ? 'paid out of' : 'paid into'} ${bankAccounts.find((b) => b.value === bankAccountId)?.label ?? 'the bank account'} in your live books${knownTotal === undefined ? '; tax and total are calculated when it is saved' : ''}.`}
          cta="Save"
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </form>
  );
}
