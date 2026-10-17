'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { AccountInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { EditorTaxRate } from '@/components/documents/DocumentEditor';
import { ACCOUNT_TYPE_GROUPS } from './account-types';

/** "Add new account", as on Xero's chart of accounts. */
export function AccountForm({
  taxRates,
  usedCodes,
  save,
  cancelHref,
}: {
  taxRates: EditorTaxRate[];
  usedCodes: string[];
  save: (input: AccountInput) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<AccountInput>({ code: '', name: '', type: '' });
  const set = (patch: Partial<AccountInput>) => setValues((v) => ({ ...v, ...patch }));

  const codeTaken = usedCodes.includes(values.code.trim());
  const problem = !values.type
    ? 'Choose an account type.'
    : !values.code.trim()
      ? 'Enter a code.'
      : codeTaken
        ? 'That code is already used.'
        : !values.name.trim()
          ? 'Enter a name.'
          : null;

  const submit = () =>
    start(async () => {
      setError(null);
      const result = await save(values);
      setConfirm(false);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(`Account ${values.code} added`);
      router.push(cancelHref);
      router.refresh();
    });

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) setConfirm(true);
      }}
    >
      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Account type" htmlFor="account-type" className="sm:col-span-2">
          <Select
            id="account-type"
            value={values.type}
            onChange={(e) => set({ type: e.target.value })}
            required
            data-testid="account-type"
          >
            <option value="">Choose…</option>
            {ACCOUNT_TYPE_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field
          label="Code"
          htmlFor="account-code"
          hint="A unique code of up to 10 characters"
          error={codeTaken ? 'That code is already used.' : undefined}
        >
          <Input
            id="account-code"
            value={values.code}
            maxLength={10}
            onChange={(e) => set({ code: e.target.value })}
            required
            data-testid="account-code"
          />
        </Field>
        <Field label="Name" htmlFor="account-name">
          <Input
            id="account-name"
            value={values.name}
            maxLength={150}
            onChange={(e) => set({ name: e.target.value })}
            required
            data-testid="account-name"
          />
        </Field>
        <Field
          label="Description (optional)"
          htmlFor="account-description"
          className="sm:col-span-2"
        >
          <Textarea
            id="account-description"
            rows={3}
            value={values.description ?? ''}
            onChange={(e) => set({ description: e.target.value || undefined })}
          />
        </Field>
        {taxRates.length > 0 && (
          <Field label="Tax" htmlFor="account-tax" className="sm:col-span-2">
            <Select
              id="account-tax"
              value={values.taxType ?? ''}
              onChange={(e) => set({ taxType: e.target.value || undefined })}
            >
              <option value="">Default</option>
              {taxRates.map((t) => (
                <option key={t.taxType} value={t.taxType}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
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
          data-testid="account-save"
        >
          Save
        </Button>
      </div>

      {confirm && (
        <ConfirmDialog
          title="Add this account?"
          body={`${values.code} · ${values.name} will be added to your live chart of accounts.`}
          cta="Add account"
          busy={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
        />
      )}
    </form>
  );
}
