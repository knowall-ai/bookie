'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { ItemInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';

export interface ItemFormValues {
  code: string;
  name: string;
  description: string;
  sells: boolean;
  salePrice: string;
  salesAccountCode: string;
  buys: boolean;
  purchasePrice: string;
  purchaseAccountCode: string;
}

const toNumber = (v: string) => (v.trim() === '' ? undefined : Number(v));

/** Xero's "New item" form: code, name, then "I purchase this" / "I sell this" sections. */
export function ItemForm({
  heading,
  initial,
  accounts,
  save,
  cancelHref,
  savedHref,
  accountsSupported,
}: {
  heading: string;
  initial?: Partial<ItemFormValues>;
  accounts: { value: string; label: string }[];
  save: (input: ItemInput) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
  savedHref: string;
  /** False when the back end sets accounts through posting groups (Business Central). */
  accountsSupported: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<ItemFormValues>({
    code: '',
    name: '',
    description: '',
    sells: true,
    salePrice: '',
    salesAccountCode: '',
    buys: false,
    purchasePrice: '',
    purchaseAccountCode: '',
    ...initial,
  });
  const set = <K extends keyof ItemFormValues>(k: K, value: ItemFormValues[K]) =>
    setV((x) => ({ ...x, [k]: value }));

  const submit = () =>
    start(async () => {
      setError(null);
      const input: ItemInput = {
        code: v.code.trim(),
        name: v.name.trim(),
        description: v.description.trim() || undefined,
        salePrice: v.sells ? (toNumber(v.salePrice) ?? 0) : undefined,
        salesAccountCode: v.sells ? v.salesAccountCode || undefined : undefined,
        purchasePrice: v.buys ? (toNumber(v.purchasePrice) ?? 0) : undefined,
        purchaseAccountCode: v.buys ? v.purchaseAccountCode || undefined : undefined,
      };
      if (!input.code) return setError('Enter an item code.');
      if (!input.name) return setError('Enter a name.');
      const result = await save(input);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success('Item saved');
      router.push(`${savedHref}/${encodeURIComponent(result.data.id)}`);
      router.refresh();
    });

  const accountField = (id: string, value: string, onChange: (value: string) => void) =>
    accounts.length > 0 ? (
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {accounts.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </Select>
    ) : (
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    );

  return (
    <form
      className="max-w-3xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h1 className="text-ink text-2xl font-bold tracking-tight">{heading}</h1>

      <div className="card grid gap-4 p-5 sm:grid-cols-3">
        <Field label="Item code" htmlFor="item-code" hint="Unique, up to 30 characters">
          <Input
            id="item-code"
            value={v.code}
            maxLength={30}
            required
            onChange={(e) => set('code', e.target.value)}
            data-testid="item-code"
          />
        </Field>
        <Field label="Item name" htmlFor="item-name" className="sm:col-span-2">
          <Input
            id="item-name"
            value={v.name}
            maxLength={50}
            required
            onChange={(e) => set('name', e.target.value)}
            data-testid="item-name"
          />
        </Field>
        <Field label="Description" htmlFor="item-description" className="sm:col-span-3">
          <Textarea
            id="item-description"
            rows={2}
            value={v.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </div>

      {(
        [
          [
            'buys',
            'I purchase this item',
            'Cost price',
            'purchasePrice',
            'Purchase account',
            'purchaseAccountCode',
          ],
          [
            'sells',
            'I sell this item',
            'Sale price',
            'salePrice',
            'Sales account',
            'salesAccountCode',
          ],
        ] as const
      ).map(([flag, label, priceLabel, priceKey, accountLabel, accountKey]) => (
        <fieldset key={flag} className="card p-5">
          <legend className="sr-only">{label}</legend>
          <label className="text-ink flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              className="accent-brand h-4 w-4"
              checked={v[flag]}
              onChange={(e) => set(flag, e.target.checked)}
              data-testid={`item-${flag}`}
            />
            {label}
          </label>
          {v[flag] && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={priceLabel} htmlFor={priceKey}>
                <Input
                  id={priceKey}
                  type="number"
                  step="any"
                  min={0}
                  className="num"
                  value={v[priceKey]}
                  onChange={(e) => set(priceKey, e.target.value)}
                  data-testid={`item-${priceKey}`}
                />
              </Field>
              {accountsSupported && (
                <Field label={accountLabel} htmlFor={accountKey}>
                  {accountField(accountKey, v[accountKey], (value) => set(accountKey, value))}
                </Field>
              )}
            </div>
          )}
        </fieldset>
      ))}

      {error && (
        <p
          role="alert"
          className="bg-danger/10 text-danger border-danger/30 rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending} data-testid="item-save">
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
