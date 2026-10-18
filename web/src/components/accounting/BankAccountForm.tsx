'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { BankAccountInput, Currency } from '@/lib/domain/types';
import type { NewBankAccountRules, SourceHint } from '@/lib/connectors/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { accountNumberLabel, bankAccountProblem } from '@/lib/portal/actions/bank-account-schema';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SourceNote } from './SourceNote';

/** Xero's labels for the kinds of bank account. */
const TYPE_LABELS: Record<NonNullable<BankAccountInput['type']>, string> = {
  bank: 'Bank account',
  'credit-card': 'Credit card',
  paypal: 'PayPal',
};

function HintLink({ hint }: { hint: SourceHint }) {
  return (
    <>
      {hint.text}{' '}
      {hint.href && (
        <a
          className="text-brand-bright hover:underline"
          href={hint.href}
          target="_blank"
          rel="noreferrer"
        >
          {hint.linkLabel ?? 'Open'}
        </a>
      )}
    </>
  );
}

/** "Add bank account", as on Xero's Bank accounts page. */
export function BankAccountForm({
  rules,
  currencies,
  sourceLabel,
  usedCodes,
  save,
  cancelHref,
}: {
  rules: NewBankAccountRules;
  /** The currencies the books actually have; nothing is preselected. */
  currencies: Currency[];
  /** "Xero", "Business Central" or "the demo books". */
  sourceLabel: string;
  usedCodes: string[];
  save: (input: BankAccountInput) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<BankAccountInput>({
    name: '',
    currency: '',
    type: rules.types.length > 1 ? undefined : rules.types[0],
  });
  const set = (patch: Partial<BankAccountInput>) => setValues((v) => ({ ...v, ...patch }));

  const trimmed: BankAccountInput = {
    ...values,
    name: values.name.trim(),
    code: values.code?.trim() || undefined,
    accountNumber: values.accountNumber?.trim() || undefined,
    iban: values.iban?.trim() || undefined,
  };
  const codeTaken = !!trimmed.code && usedCodes.includes(trimmed.code);
  const problem = !values.type
    ? 'Choose an account type.'
    : !trimmed.name
      ? 'Enter an account name.'
      : codeTaken
        ? 'That code is already used.'
        : !values.currency
          ? 'Choose a currency.'
          : (bankAccountProblem(trimmed, rules, currencies) ?? null);
  const numberLabel = accountNumberLabel(values.type);

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await save(trimmed);
      setConfirm(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`${trimmed.name} added`);
      router.push(cancelHref);
      router.refresh();
    });

  return (
    <form
      className="max-w-2xl space-y-5"
      aria-label="Add bank account"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) setConfirm(true);
      }}
    >
      {rules.note && (
        <SourceNote>
          <HintLink hint={rules.note} />
        </SourceNote>
      )}
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        {rules.types.length > 1 && (
          <Field label="Account type" htmlFor="bank-account-type" className="sm:col-span-2">
            <Select
              id="bank-account-type"
              value={values.type ?? ''}
              onChange={(e) =>
                set({ type: (e.target.value || undefined) as BankAccountInput['type'] })
              }
              required
              data-testid="bank-account-type"
            >
              <option value="">Choose…</option>
              {rules.types.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Account name" htmlFor="bank-account-name" className="sm:col-span-2">
          <Input
            id="bank-account-name"
            value={values.name}
            maxLength={rules.nameMaxLength}
            onChange={(e) => set({ name: e.target.value })}
            required
            data-testid="bank-account-name"
          />
        </Field>
        <Field
          label={rules.accountNumberRequired ? numberLabel : `${numberLabel} (optional)`}
          htmlFor="bank-account-number"
        >
          <Input
            id="bank-account-number"
            value={values.accountNumber ?? ''}
            maxLength={rules.accountNumberMaxLength}
            onChange={(e) => set({ accountNumber: e.target.value })}
            required={rules.accountNumberRequired}
            data-testid="bank-account-number"
          />
        </Field>
        <Field
          label={rules.codeOptional ? 'Code (optional)' : 'Code'}
          htmlFor="bank-account-code"
          hint={[`Up to ${rules.codeMaxLength} characters.`, rules.codeHint]
            .filter(Boolean)
            .join(' ')}
          error={codeTaken ? 'That code is already used.' : undefined}
        >
          <Input
            id="bank-account-code"
            value={values.code ?? ''}
            maxLength={rules.codeMaxLength}
            onChange={(e) => set({ code: e.target.value })}
            required={!rules.codeOptional}
            data-testid="bank-account-code"
          />
        </Field>
        {rules.iban && (
          <Field label="IBAN (optional)" htmlFor="bank-account-iban" className="sm:col-span-2">
            <Input
              id="bank-account-iban"
              value={values.iban ?? ''}
              maxLength={50}
              onChange={(e) => set({ iban: e.target.value })}
              data-testid="bank-account-iban"
            />
          </Field>
        )}
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="bank-account-currency" className="text-body text-sm font-medium">
            Currency
          </label>
          <Select
            id="bank-account-currency"
            value={values.currency}
            onChange={(e) => set({ currency: e.target.value })}
            required
            data-testid="bank-account-currency"
          >
            <option value="">Choose…</option>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name ? `${c.code} ${c.name}` : c.code}
              </option>
            ))}
          </Select>
          <p className="text-faint text-xs" data-testid="bank-account-currency-hint">
            Only the currencies set up in {sourceLabel} are listed.{' '}
            <HintLink hint={rules.currencySetup} />
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="bg-danger/10 text-danger border-danger/30 rounded-lg border px-4 py-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {problem && <p className="text-faint mr-auto text-xs">{problem}</p>}
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !!problem}
          data-testid="bank-account-save"
        >
          Save
        </Button>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Add this bank account?"
          body={`${trimmed.name} (${trimmed.currency}) will be added to your live books in ${sourceLabel}.`}
          cta="Add bank account"
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </form>
  );
}
