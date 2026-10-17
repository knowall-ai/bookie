'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import type { LineAmountType, LineItemInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { formatMoney } from '@/lib/ui/format';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Textarea, inputClass } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/ui/cn';

export interface EditorOption {
  value: string;
  label: string;
}

export interface EditorItem {
  code: string;
  name: string;
  description?: string;
  price?: number;
  accountCode?: string;
}

export interface EditorTaxRate {
  taxType: string;
  name: string;
  rate: number;
}

export interface EditorValues {
  contactId: string;
  date: string;
  dueDate?: string;
  number?: string;
  reference?: string;
  title?: string;
  summary?: string;
  terms?: string;
  brandingThemeId?: string;
  lineAmountType: LineAmountType;
  lineItems: LineItemInput[];
}

export interface EditorPayload extends EditorValues {
  type?: 'sales' | 'purchase';
  status?: 'draft' | 'authorised';
}

type Intent = 'draft' | 'approve';

const blankLine = (): LineItemInput => ({ description: '', quantity: 1, unitAmount: 0 });

function lineAmount(line: LineItemInput) {
  return (
    Math.round(line.quantity * line.unitAmount * (1 - (line.discountRate ?? 0) / 100) * 100) / 100
  );
}

/**
 * The document editor for invoices, bills, quotes and purchase orders,
 * laid out like Xero's: header fields, an editable line grid, live totals.
 */
export function DocumentEditor({
  heading,
  currency,
  contacts,
  contactLabel,
  accounts,
  taxRates,
  items,
  initial,
  dateLabel = 'Date',
  secondDateLabel,
  numberLabel,
  extraFields = [],
  docType,
  save,
  cancelHref,
  savedHref,
  canApprove,
  approveLabel = 'Approve',
  approveBody,
  brandingThemes = [],
}: {
  heading: string;
  currency: string;
  contacts: EditorOption[];
  contactLabel: string;
  accounts: EditorOption[];
  taxRates: EditorTaxRate[];
  items: EditorItem[];
  initial?: Partial<EditorValues>;
  dateLabel?: string;
  /** "Due date", "Expiry", "Delivery date"; omit to hide. */
  secondDateLabel?: string;
  /** Omit to hide the number field (system-generated). */
  numberLabel?: string;
  extraFields?: ('title' | 'summary' | 'terms')[];
  docType?: 'sales' | 'purchase';
  save: (payload: EditorPayload) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
  /** Detail path; the saved id is appended. */
  savedHref: string;
  canApprove?: boolean;
  /** Second save button's label, e.g. "Save and mark as sent" for quotes. */
  approveLabel?: string;
  /** Confirm dialog text for the second save button. */
  approveBody?: string;
  /** Invoice templates; the picker only shows when there is a real choice (two or more). */
  brandingThemes?: EditorOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState<EditorValues>({
    contactId: initial?.contactId ?? '',
    date: initial?.date ?? today,
    dueDate: initial?.dueDate,
    number: initial?.number,
    reference: initial?.reference,
    title: initial?.title,
    summary: initial?.summary,
    terms: initial?.terms,
    brandingThemeId: initial?.brandingThemeId,
    lineAmountType: initial?.lineAmountType ?? 'exclusive',
    lineItems: initial?.lineItems?.length ? initial.lineItems : [blankLine()],
  });

  const rateFor = useMemo(() => {
    const map = new Map(taxRates.map((t) => [t.taxType, t.rate]));
    return (taxType?: string) => (taxType ? (map.get(taxType) ?? 0) : 0);
  }, [taxRates]);

  const totals = useMemo(() => {
    let subTotal = 0;
    let tax = 0;
    for (const line of values.lineItems) {
      const amount = lineAmount(line);
      const rate = rateFor(line.taxType) / 100;
      if (values.lineAmountType === 'inclusive') {
        const lineTax = amount - amount / (1 + rate);
        tax += lineTax;
        subTotal += amount - lineTax;
      } else {
        subTotal += amount;
        if (values.lineAmountType === 'exclusive') tax += amount * rate;
      }
    }
    return { subTotal, tax, total: subTotal + tax };
  }, [values.lineItems, values.lineAmountType, rateFor]);

  const set = <K extends keyof EditorValues>(key: K, value: EditorValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setLine = (index: number, patch: Partial<LineItemInput>) =>
    setValues((v) => ({
      ...v,
      lineItems: v.lineItems.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    }));

  const chooseItem = (index: number, code: string) => {
    const item = items.find((i) => i.code === code);
    if (!item) return setLine(index, { itemCode: undefined });
    setLine(index, {
      itemCode: item.code,
      description: item.description || item.name,
      unitAmount: item.price ?? 0,
      accountCode: item.accountCode,
    });
  };

  const submit = (intent: Intent) =>
    start(async () => {
      setError(null);
      const lines = values.lineItems.filter((l) => l.description || l.unitAmount || l.itemCode);
      if (!values.contactId) return setError(`Choose a ${contactLabel.toLowerCase()}.`);
      if (lines.length === 0) return setError('Add at least one line.');
      const result = await save({
        ...values,
        lineItems: lines,
        type: docType,
        status: intent === 'approve' ? 'authorised' : 'draft',
      });
      setConfirmApprove(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(
        intent === 'approve'
          ? approveLabel === 'Approve'
            ? 'Saved and approved'
            : 'Saved'
          : 'Saved as draft'
      );
      router.push(`${savedHref}/${encodeURIComponent(result.data.id)}`);
      router.refresh();
    });

  const accountOptions = accounts.length > 0;
  const taxOptions = taxRates.length > 0;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit('draft');
      }}
    >
      <h1 className="text-ink text-2xl font-bold tracking-tight">{heading}</h1>

      <div className="card grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={contactLabel} htmlFor="contact" className="lg:col-span-2">
          <Select
            id="contact"
            value={values.contactId}
            onChange={(e) => set('contactId', e.target.value)}
            required
            data-testid="editor-contact"
          >
            <option value="">Choose…</option>
            {contacts.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={dateLabel} htmlFor="date">
          <Input
            id="date"
            type="date"
            value={values.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </Field>
        {secondDateLabel && (
          <Field label={secondDateLabel} htmlFor="due">
            <Input
              id="due"
              type="date"
              value={values.dueDate ?? ''}
              onChange={(e) => set('dueDate', e.target.value || undefined)}
            />
          </Field>
        )}
        {numberLabel && (
          <Field label={numberLabel} htmlFor="number" hint="Leave blank to auto-number">
            <Input
              id="number"
              value={values.number ?? ''}
              onChange={(e) => set('number', e.target.value || undefined)}
            />
          </Field>
        )}
        <Field label="Reference" htmlFor="reference">
          <Input
            id="reference"
            value={values.reference ?? ''}
            onChange={(e) => set('reference', e.target.value || undefined)}
          />
        </Field>
        <Field label="Amounts are" htmlFor="lat">
          <Select
            id="lat"
            value={values.lineAmountType}
            onChange={(e) => set('lineAmountType', e.target.value as LineAmountType)}
          >
            <option value="exclusive">Tax exclusive</option>
            <option value="inclusive">Tax inclusive</option>
            <option value="none">No tax</option>
          </Select>
        </Field>
        {brandingThemes.length > 1 && (
          <Field label="Branding theme" htmlFor="theme">
            <Select
              id="theme"
              value={values.brandingThemeId ?? ''}
              onChange={(e) => set('brandingThemeId', e.target.value || undefined)}
              data-testid="editor-theme"
            >
              <option value="">Default</option>
              {brandingThemes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {extraFields.includes('title') && (
          <Field label="Title" htmlFor="title" className="sm:col-span-2">
            <Input
              id="title"
              value={values.title ?? ''}
              onChange={(e) => set('title', e.target.value || undefined)}
            />
          </Field>
        )}
        {extraFields.includes('summary') && (
          <Field label="Summary" htmlFor="summary" className="sm:col-span-2 lg:col-span-3">
            <Input
              id="summary"
              value={values.summary ?? ''}
              onChange={(e) => set('summary', e.target.value || undefined)}
            />
          </Field>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-line bg-surface-2/60 text-muted border-b text-xs font-semibold tracking-wide uppercase">
              {items.length > 0 && <th className="w-36 px-3 py-3 text-left">Item</th>}
              <th className="px-3 py-3 text-left">Description</th>
              <th className="w-24 px-3 py-3 text-right">Qty</th>
              <th className="w-32 px-3 py-3 text-right">Price</th>
              <th className="w-20 px-3 py-3 text-right">Disc %</th>
              <th className="w-44 px-3 py-3 text-left">Account</th>
              {values.lineAmountType !== 'none' && (
                <th className="w-40 px-3 py-3 text-left">Tax rate</th>
              )}
              <th className="w-32 px-3 py-3 text-right">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {values.lineItems.map((line, i) => (
              <tr key={i} className="border-line/70 border-b align-top last:border-0">
                {items.length > 0 && (
                  <td className="px-2 py-2">
                    <select
                      aria-label="Item"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.itemCode ?? ''}
                      onChange={(e) => chooseItem(i, e.target.value)}
                    >
                      <option value="" />
                      {items.map((item) => (
                        <option key={item.code} value={item.code}>
                          {item.code}
                        </option>
                      ))}
                    </select>
                  </td>
                )}
                <td className="px-2 py-2">
                  <Textarea
                    aria-label="Description"
                    rows={1}
                    className="min-h-9 resize-y py-1.5"
                    value={line.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    data-testid={`line-${i}-description`}
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
                    data-testid={`line-${i}-price`}
                  />
                </td>
                <td className="px-2 py-2">
                  <input
                    aria-label="Discount percent"
                    type="number"
                    step="any"
                    min={0}
                    max={100}
                    className={cn(inputClass, 'num h-9 px-2 text-right')}
                    value={line.discountRate ?? ''}
                    onChange={(e) =>
                      setLine(i, {
                        discountRate: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  {accountOptions ? (
                    <select
                      aria-label="Account"
                      className={cn(inputClass, 'h-9 px-2')}
                      value={line.accountCode ?? ''}
                      onChange={(e) => setLine(i, { accountCode: e.target.value || undefined })}
                    >
                      <option value="" />
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
                    />
                  )}
                </td>
                {values.lineAmountType !== 'none' && (
                  <td className="px-2 py-2">
                    {taxOptions ? (
                      <select
                        aria-label="Tax rate"
                        className={cn(inputClass, 'h-9 px-2')}
                        value={line.taxType ?? ''}
                        onChange={(e) => setLine(i, { taxType: e.target.value || undefined })}
                      >
                        <option value="">Default</option>
                        {taxRates.map((t) => (
                          <option key={t.taxType} value={t.taxType}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label="Tax code"
                        className={cn(inputClass, 'h-9 px-2')}
                        value={line.taxType ?? ''}
                        onChange={(e) => setLine(i, { taxType: e.target.value || undefined })}
                      />
                    )}
                  </td>
                )}
                <td className="num text-ink px-3 py-3.5 text-right">
                  {formatMoney(lineAmount(line))}
                </td>
                <td className="px-1 py-2">
                  <button
                    type="button"
                    aria-label="Remove line"
                    className="text-faint hover:text-danger flex h-9 w-8 items-center justify-center disabled:opacity-30"
                    disabled={values.lineItems.length === 1}
                    onClick={() =>
                      setValues((v) => ({ ...v, lineItems: v.lineItems.filter((_, n) => n !== i) }))
                    }
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
            onClick={() => setValues((v) => ({ ...v, lineItems: [...v.lineItems, blankLine()] }))}
          >
            <Plus className="h-4 w-4" /> Add a new line
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          {extraFields.includes('terms') && (
            <Field label="Terms" htmlFor="terms">
              <Textarea
                id="terms"
                rows={4}
                value={values.terms ?? ''}
                onChange={(e) => set('terms', e.target.value || undefined)}
              />
            </Field>
          )}
        </div>
        <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="num">{formatMoney(totals.subTotal)}</dd>
          </div>
          {values.lineAmountType !== 'none' && (
            <div className="flex justify-between">
              <dt className="text-muted">
                {values.lineAmountType === 'inclusive' ? 'Includes tax' : 'Total tax'}
              </dt>
              <dd className="num">{formatMoney(totals.tax)}</dd>
            </div>
          )}
          <div className="border-line-strong text-ink flex justify-between border-t pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd className="num" data-testid="editor-total">
              {formatMoney(totals.total, currency)}
            </dd>
          </div>
          {!taxOptions && values.lineAmountType !== 'none' && (
            <p className="text-faint text-xs">
              Tax shown here is an estimate; your accounting system calculates the final figure.
            </p>
          )}
        </dl>
      </div>

      {error && (
        <p
          role="alert"
          className="bg-danger/10 text-danger border-danger/30 rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="bg-canvas/90 border-line sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={pending} data-testid="save-draft">
          {pending ? 'Saving…' : 'Save as draft'}
        </Button>
        {canApprove && (
          <Button
            variant="primary"
            disabled={pending}
            onClick={() => setConfirmApprove(true)}
            data-testid="save-approve"
          >
            {approveLabel}
          </Button>
        )}
      </div>

      {confirmApprove && (
        <ConfirmDialog
          title={approveLabel === 'Approve' ? 'Save and approve?' : `${approveLabel}?`}
          body={
            approveBody ??
            `This posts the document to your live books for ${formatMoney(totals.total, currency)}.`
          }
          cta={approveLabel}
          busy={pending}
          onCancel={() => setConfirmApprove(false)}
          onConfirm={() => submit('approve')}
        />
      )}
    </form>
  );
}
