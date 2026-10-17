'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { ManualJournalInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, inputClass } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { EditorOption, EditorTaxRate } from '@/components/documents/DocumentEditor';

interface Line {
  description: string;
  accountCode: string;
  taxType: string;
  debit: string;
  credit: string;
}

const blank = (): Line => ({
  description: '',
  accountCode: '',
  taxType: '',
  debit: '',
  credit: '',
});

const cents = (value: string) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

/** Totals in cents, so floating point never decides whether a journal balances. */
export function journalTotals(lines: Pick<Line, 'debit' | 'credit'>[]) {
  const debit = lines.reduce((s, l) => s + cents(l.debit), 0);
  const credit = lines.reduce((s, l) => s + cents(l.credit), 0);
  return { debit, credit, difference: debit - credit };
}

/** Lines with an amount, signed: debit positive, credit negative. */
export function toJournalLines(lines: Line[]): ManualJournalInput['lines'] {
  return lines
    .filter((l) => cents(l.debit) || cents(l.credit))
    .map((l) => ({
      accountCode: l.accountCode,
      description: l.description || undefined,
      taxType: l.taxType || undefined,
      amount: (cents(l.debit) - cents(l.credit)) / 100,
    }));
}

/** A saved journal line back into the editor's debit/credit form. */
export function fromJournalLine(line: ManualJournalInput['lines'][number]): Line {
  const amount = Math.round(line.amount * 100) / 100;
  return {
    description: line.description ?? '',
    accountCode: line.accountCode,
    taxType: line.taxType ?? '',
    debit: amount > 0 ? amount.toFixed(2) : '',
    credit: amount < 0 ? (-amount).toFixed(2) : '',
  };
}

/**
 * Xero's manual journal form: narration, date, then a debit/credit grid that
 * must balance before it can be saved or posted.
 */
export function JournalEditor({
  currency,
  accounts,
  taxRates,
  save,
  cancelHref,
  savedHref,
  initial,
}: {
  /** Prefill, e.g. a reversal of an existing journal (debits and credits swapped). */
  initial?: Pick<ManualJournalInput, 'narration' | 'lines'> & { date?: string };
  currency: string;
  accounts: EditorOption[];
  taxRates: EditorTaxRate[];
  save: (input: ManualJournalInput) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
  savedHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [narration, setNarration] = useState(initial?.narration ?? '');
  const [date, setDate] = useState(() => initial?.date ?? new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>(() =>
    initial?.lines.length ? initial.lines.map(fromJournalLine) : [blank(), blank()]
  );
  const [confirmPost, setConfirmPost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totals = useMemo(() => journalTotals(lines), [lines]);
  const entered = toJournalLines(lines);
  const missingAccount = lines.some((l) => (cents(l.debit) || cents(l.credit)) && !l.accountCode);
  const problem = !narration.trim()
    ? 'Enter a narration.'
    : entered.length < 2
      ? 'Enter at least two lines.'
      : missingAccount
        ? 'Choose an account on every line with an amount.'
        : totals.difference !== 0
          ? 'Debits and credits must balance.'
          : null;
  const ready = !problem;

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((all) => all.map((l, i) => (i === index ? { ...l, ...patch } : l)));

  const submit = (status: 'draft' | 'posted') =>
    start(async () => {
      setError(null);
      const result = await save({ date, narration: narration.trim(), status, lines: entered });
      setConfirmPost(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(status === 'posted' ? 'Journal posted' : 'Journal saved as draft');
      router.push(`${savedHref}/${encodeURIComponent(result.data.id)}`);
      router.refresh();
    });

  const amountInput = (i: number, side: 'debit' | 'credit', label: string) => (
    <input
      aria-label={label}
      type="number"
      inputMode="decimal"
      step="0.01"
      min={0}
      className={cn(inputClass, 'num h-9 px-2 text-right')}
      value={lines[i][side]}
      onChange={(e) =>
        setLine(i, {
          [side]: e.target.value,
          ...(e.target.value ? { [side === 'debit' ? 'credit' : 'debit']: '' } : {}),
        })
      }
      data-testid={`journal-line-${i}-${side}`}
    />
  );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit('draft');
      }}
    >
      <h1 className="text-ink text-2xl font-bold tracking-tight">New manual journal</h1>

      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Narration" htmlFor="narration" className="sm:col-span-2">
          <Input
            id="narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="What is this journal for?"
            required
            data-testid="journal-narration"
          />
        </Field>
        <Field label="Date" htmlFor="journal-date">
          <Input
            id="journal-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-line bg-surface-2/60 text-muted border-b text-xs font-semibold tracking-wide uppercase">
              <th className="px-3 py-3 text-left">Description</th>
              <th className="w-64 px-3 py-3 text-left">Account</th>
              {taxRates.length > 0 && <th className="w-44 px-3 py-3 text-left">Tax rate</th>}
              <th className="w-32 px-3 py-3 text-right">Debit {currency}</th>
              <th className="w-32 px-3 py-3 text-right">Credit {currency}</th>
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
                  />
                </td>
                <td className="px-2 py-2">
                  {accounts.length > 0 ? (
                    <select
                      aria-label="Account"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.accountCode}
                      onChange={(e) => setLine(i, { accountCode: e.target.value })}
                      data-testid={`journal-line-${i}-account`}
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
                      value={line.accountCode}
                      onChange={(e) => setLine(i, { accountCode: e.target.value })}
                      data-testid={`journal-line-${i}-account`}
                    />
                  )}
                </td>
                {taxRates.length > 0 && (
                  <td className="px-2 py-2">
                    <select
                      aria-label="Tax rate"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.taxType}
                      onChange={(e) => setLine(i, { taxType: e.target.value })}
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
                <td className="px-2 py-2">{amountInput(i, 'debit', 'Debit')}</td>
                <td className="px-2 py-2">{amountInput(i, 'credit', 'Credit')}</td>
                <td className="px-1 py-2">
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="text-faint hover:text-danger flex h-9 w-8 items-center justify-center disabled:opacity-30"
                    disabled={lines.length <= 2}
                    onClick={() => setLines((all) => all.filter((_, n) => n !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-line-strong border-t">
              <td className="px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLines((all) => [...all, blank()])}
                >
                  <Plus className="h-4 w-4" /> Add a new line
                </Button>
              </td>
              <td
                colSpan={taxRates.length > 0 ? 2 : 1}
                className="text-muted px-3 py-3 text-right font-semibold"
              >
                Total
              </td>
              <td
                className="num text-ink px-3 py-3 text-right font-semibold"
                data-testid="journal-total-debit"
              >
                {formatMoney(totals.debit / 100)}
              </td>
              <td
                className="num text-ink px-3 py-3 text-right font-semibold"
                data-testid="journal-total-credit"
              >
                {formatMoney(totals.credit / 100)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        aria-live="polite"
        className={cn(
          'rounded-lg border px-4 py-3 text-sm',
          totals.difference !== 0
            ? 'border-warn/30 bg-warn/10 text-warn'
            : totals.debit > 0
              ? 'border-brand/30 bg-brand/5 text-brand-bright'
              : 'border-line bg-surface text-muted'
        )}
        data-testid="journal-balance"
      >
        {totals.difference === 0
          ? totals.debit > 0
            ? 'Debits equal credits.'
            : 'Enter debits and credits; they must balance.'
          : `Out of balance by ${formatMoney(Math.abs(totals.difference) / 100, currency)} (${totals.difference > 0 ? 'more debits' : 'more credits'}).`}
      </div>

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
        <Button type="submit" disabled={pending || !ready} data-testid="journal-save-draft">
          {pending ? 'Saving…' : 'Save as draft'}
        </Button>
        <Button
          variant="primary"
          disabled={pending || !ready}
          onClick={() => setConfirmPost(true)}
          data-testid="journal-post"
        >
          Post
        </Button>
      </div>

      {confirmPost && (
        <ConfirmDialog
          title="Post this journal?"
          body={`This posts ${formatMoney(totals.debit / 100, currency)} of debits and credits to your live books. Posted journals can't be edited here.`}
          cta="Post journal"
          busy={pending}
          onCancel={() => setConfirmPost(false)}
          onConfirm={() => submit('posted')}
        />
      )}
    </form>
  );
}
