'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { ContactInput } from '@/lib/domain/types';
import type { ActionResult } from '@/lib/portal/actions/util';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';

type FormValues = Required<Omit<ContactInput, 'address' | 'isCustomer' | 'isSupplier'>> & {
  address: Required<NonNullable<ContactInput['address']>>;
  isCustomer: boolean;
  isSupplier: boolean;
};

function toValues(initial?: Partial<ContactInput>): FormValues {
  const a = initial?.address ?? {};
  return {
    name: initial?.name ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    website: initial?.website ?? '',
    accountNumber: initial?.accountNumber ?? '',
    taxNumber: initial?.taxNumber ?? '',
    address: {
      line1: a.line1 ?? '',
      line2: a.line2 ?? '',
      city: a.city ?? '',
      region: a.region ?? '',
      postalCode: a.postalCode ?? '',
      country: a.country ?? '',
    },
    isCustomer: initial?.isCustomer ?? true,
    isSupplier: initial?.isSupplier ?? false,
  };
}

/** New / edit contact, with Xero's field names and grouping. */
export function ContactForm({
  initial,
  isNew,
  save,
  cancelHref,
  savedHref,
}: {
  initial?: Partial<ContactInput>;
  isNew: boolean;
  save: (input: ContactInput) => Promise<ActionResult<{ id: string }>>;
  cancelHref: string;
  /** Where to go after saving; `{id}` is replaced with the contact id. */
  savedHref: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => toValues(initial));
  const [error, setError] = useState<string>();
  const [nameError, setNameError] = useState<string>();
  const [pending, start] = useTransition();

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));
  const setAddress = (key: keyof FormValues['address'], value: string) =>
    setValues((v) => ({ ...v, address: { ...v.address, [key]: value } }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setNameError('Enter a contact name.');
      return;
    }
    if (isNew && !values.isCustomer && !values.isSupplier) {
      setError('Choose whether this contact is a customer, a supplier or both.');
      return;
    }
    setNameError(undefined);
    setError(undefined);
    start(async () => {
      const { isCustomer, isSupplier, ...rest } = values;
      const result = await save({ ...rest, ...(isNew ? { isCustomer, isSupplier } : {}) });
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(isNew ? 'Contact created' : 'Contact saved');
      router.push(savedHref.replace('{id}', encodeURIComponent(result.data.id)));
      router.refresh();
    });
  };

  const text = (
    key: Exclude<keyof FormValues, 'address' | 'isCustomer' | 'isSupplier'>,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {}
  ) => (
    <Field label={label} htmlFor={`contact-${key}`}>
      <Input
        id={`contact-${key}`}
        name={key}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={pending}
        {...props}
      />
    </Field>
  );

  const addr = (key: keyof FormValues['address'], label: string, autoComplete: string) => (
    <Field label={label} htmlFor={`contact-address-${key}`}>
      <Input
        id={`contact-address-${key}`}
        value={values.address[key]}
        onChange={(e) => setAddress(key, e.target.value)}
        autoComplete={autoComplete}
        disabled={pending}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="mx-auto max-w-4xl space-y-5">
      {error && (
        <p role="alert" className="card border-danger/30 text-danger px-4 py-3 text-sm">
          {error}
        </p>
      )}

      <Card>
        <CardHeader title="Contact details" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field
            label="Contact name"
            htmlFor="contact-name"
            error={nameError}
            className="sm:col-span-2"
          >
            <Input
              id="contact-name"
              name="name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              required
              aria-required="true"
              aria-invalid={!!nameError}
              autoFocus={isNew}
              disabled={pending}
              placeholder="Business or person name"
            />
          </Field>
          {text('accountNumber', 'Account number')}
          {text('taxNumber', 'Tax number', { placeholder: 'e.g. VAT registration number' })}
          {isNew && (
            <fieldset className="sm:col-span-2">
              <legend className="text-body mb-1.5 text-sm font-medium">This contact is a</legend>
              <div className="flex flex-wrap gap-5">
                <label className="text-ink flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.isCustomer}
                    onChange={(e) => set('isCustomer', e.target.checked)}
                    disabled={pending}
                    className="accent-brand h-4 w-4"
                  />
                  Customer
                </label>
                <label className="text-ink flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values.isSupplier}
                    onChange={(e) => set('isSupplier', e.target.checked)}
                    disabled={pending}
                    className="accent-brand h-4 w-4"
                  />
                  Supplier
                </label>
              </div>
              <p className="text-faint mt-1.5 text-xs">
                Some accounting systems also set this from the contact&rsquo;s invoices and bills.
              </p>
            </fieldset>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Primary person" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {text('firstName', 'First name', { autoComplete: 'given-name' })}
          {text('lastName', 'Last name', { autoComplete: 'family-name' })}
          {text('email', 'Email', { type: 'email', autoComplete: 'email' })}
          {text('phone', 'Phone', { type: 'tel', autoComplete: 'tel' })}
          {text('website', 'Website', {
            type: 'url',
            placeholder: 'www.example.com',
            autoComplete: 'url',
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Postal address" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {addr('line1', 'Address line 1', 'address-line1')}
          {addr('line2', 'Address line 2', 'address-line2')}
          {addr('city', 'Town / city', 'address-level2')}
          {addr('region', 'State / region', 'address-level1')}
          {addr('postalCode', 'Postal / zip code', 'postal-code')}
          {addr('country', 'Country', 'country-name')}
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
