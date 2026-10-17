'use client';

import { useState, useTransition } from 'react';
import { CalendarPlus, Pencil, Repeat, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deletePlannedItem, savePlannedItem } from '@/lib/portal/actions/forecast';
import type { PlannedItem, PlannedRepeat } from '@/lib/forecast/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { LayerSwatch } from './legend';

const REPEAT_LABEL: Record<PlannedRepeat, string> = {
  weekly: 'Every week',
  monthly: 'Every month',
  quarterly: 'Every quarter',
};

interface Draft {
  description: string;
  amount: string;
  direction: 'in' | 'out';
  currency: string;
  date: string;
  repeat: '' | PlannedRepeat;
  endDate: string;
}

const blank = (currency: string, today: string): Draft => ({
  description: '',
  amount: '',
  direction: 'out',
  currency,
  date: today,
  repeat: '',
  endDate: '',
});

function PlannedForm({
  orgKey,
  item,
  currencies,
  currency,
  today,
  onDone,
}: {
  orgKey: string;
  item?: PlannedItem;
  currencies: string[];
  currency: string;
  today: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(
    item
      ? {
          description: item.description,
          amount: String(item.amount),
          direction: item.direction,
          currency: item.currency,
          date: item.date,
          repeat: item.repeat ?? '',
          endDate: item.endDate ?? '',
        }
      : blank(currency, today)
  );
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const id = item?.id ?? 'new';
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    start(async () => {
      const result = await savePlannedItem(orgKey, item?.id, {
        description: draft.description,
        amount: draft.amount,
        direction: draft.direction,
        currency: draft.currency,
        date: draft.date,
        repeat: draft.repeat || undefined,
        endDate: draft.repeat && draft.endDate ? draft.endDate : undefined,
      });
      if (!result.ok) return setError(result.error);
      toast.success(item ? 'Planned item saved' : 'Planned item added');
      onDone();
    });
  };

  return (
    <form
      onSubmit={submit}
      className="border-line bg-surface-2/40 grid gap-4 border-b px-5 py-4 sm:grid-cols-2 lg:grid-cols-6"
      aria-label={item ? `Edit ${item.description}` : 'Add a planned item'}
      data-testid="planned-form"
    >
      <Field label="Description" htmlFor={`pi-desc-${id}`} className="lg:col-span-2">
        <Input
          id={`pi-desc-${id}`}
          value={draft.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Salaries, VAT, rent, a new contract…"
          maxLength={200}
          required
        />
      </Field>
      <Field label="Money" htmlFor={`pi-dir-${id}`}>
        <Select
          id={`pi-dir-${id}`}
          value={draft.direction}
          onChange={(e) => set({ direction: e.target.value as 'in' | 'out' })}
        >
          <option value="out">Going out</option>
          <option value="in">Coming in</option>
        </Select>
      </Field>
      <Field label="Amount" htmlFor={`pi-amount-${id}`}>
        <div className="flex gap-2">
          <Select
            aria-label="Currency"
            value={draft.currency}
            onChange={(e) => set({ currency: e.target.value })}
            className="w-24 shrink-0"
          >
            {currencies.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input
            id={`pi-amount-${id}`}
            inputMode="decimal"
            value={draft.amount}
            onChange={(e) => set({ amount: e.target.value })}
            placeholder="0.00"
            className="num text-right"
            required
          />
        </div>
      </Field>
      <Field label={draft.repeat ? 'First date' : 'Date'} htmlFor={`pi-date-${id}`}>
        <Input
          id={`pi-date-${id}`}
          type="date"
          value={draft.date}
          onChange={(e) => set({ date: e.target.value })}
          required
        />
      </Field>
      <Field label="Repeat" htmlFor={`pi-repeat-${id}`}>
        <Select
          id={`pi-repeat-${id}`}
          value={draft.repeat}
          onChange={(e) => set({ repeat: e.target.value as Draft['repeat'] })}
        >
          <option value="">Doesn&apos;t repeat</option>
          <option value="weekly">Every week</option>
          <option value="monthly">Every month</option>
          <option value="quarterly">Every quarter</option>
        </Select>
      </Field>
      {draft.repeat && (
        <Field
          label="End date"
          htmlFor={`pi-end-${id}`}
          hint="Optional. Leave blank to repeat to the end of the forecast."
          className="lg:col-span-2"
        >
          <Input
            id={`pi-end-${id}`}
            type="date"
            value={draft.endDate}
            min={draft.date}
            onChange={(e) => set({ endDate: e.target.value })}
          />
        </Field>
      )}
      <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2 lg:col-span-6">
        {error && (
          <p role="alert" className="text-danger mr-auto self-center text-sm">
            {error}
          </p>
        )}
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : item ? 'Save item' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}

/** The user's own forecast lines: always labelled as theirs, never mixed into Known. */
export function PlannedItems({
  orgKey,
  items,
  currencies,
  currency,
  today,
  storedIn,
}: {
  orgKey: string;
  items: PlannedItem[];
  currencies: string[];
  currency: string;
  today: string;
  storedIn: string;
}) {
  const [editing, setEditing] = useState<string | 'new'>();
  const [deleting, setDeleting] = useState<PlannedItem>();
  const [busy, start] = useTransition();
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));

  const confirmDelete = () =>
    start(async () => {
      if (!deleting) return;
      const result = await deletePlannedItem(orgKey, deleting.id);
      if (!result.ok) toast.error(result.error);
      else toast.success('Planned item deleted');
      setDeleting(undefined);
    });

  return (
    <Card id="planned" data-testid="planned-items">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <LayerSwatch layer="planned" direction="out" />
            Planned (you entered this)
          </span>
        }
        subtitle={`Your own assumptions: salaries, VAT, rent, a new contract. Saved in ${storedIn}, never in your books.`}
        action={
          editing !== 'new' && (
            <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
              <CalendarPlus className="h-4 w-4" aria-hidden /> Add planned item
            </Button>
          )
        }
      />
      {editing === 'new' && (
        <PlannedForm
          orgKey={orgKey}
          currencies={currencies}
          currency={currency}
          today={today}
          onDone={() => setEditing(undefined)}
        />
      )}
      {sorted.length === 0 && editing !== 'new' ? (
        <p className="text-muted px-5 py-6 text-sm">
          Nothing planned yet. Add the payments you know are coming that aren&apos;t in your books,
          like salaries or a VAT bill, to see them in the forecast.
        </p>
      ) : (
        <ul className="divide-line divide-y">
          {sorted.map((item) =>
            editing === item.id ? (
              <li key={item.id} id={`planned-${item.id}`}>
                <PlannedForm
                  orgKey={orgKey}
                  item={item}
                  currencies={
                    currencies.includes(item.currency) ? currencies : [...currencies, item.currency]
                  }
                  currency={currency}
                  today={today}
                  onDone={() => setEditing(undefined)}
                />
              </li>
            ) : (
              <li
                key={item.id}
                id={`planned-${item.id}`}
                className="target:bg-brand/5 flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate font-medium">{item.description}</p>
                  <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span>{formatDate(item.date)}</span>
                    {item.repeat && (
                      <span className="flex items-center gap-1">
                        <Repeat className="h-3 w-3" aria-hidden />
                        {REPEAT_LABEL[item.repeat]}
                        {item.endDate ? ` until ${formatDate(item.endDate)}` : ''}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'num font-medium',
                      item.direction === 'in' ? 'text-ink' : 'text-body'
                    )}
                  >
                    <span className="text-muted mr-2 text-xs font-normal">
                      {item.direction === 'in' ? 'Coming in' : 'Going out'}
                    </span>
                    {formatMoney(item.amount, item.currency)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(item.id)}
                    aria-label={`Edit ${item.description}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(item)}
                    aria-label={`Delete ${item.description}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete this planned item?"
          body={`"${deleting.description}" will be removed from the forecast. Your books aren't affected.`}
          cta="Delete"
          danger
          busy={busy}
          onCancel={() => setDeleting(undefined)}
          onConfirm={confirmDelete}
        />
      )}
    </Card>
  );
}
