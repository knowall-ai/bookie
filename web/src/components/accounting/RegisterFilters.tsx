import Link from 'next/link';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';

export interface RegisterFilterValues {
  search?: string;
  from?: string;
  to?: string;
  direction?: 'spent' | 'received';
  reconciled?: 'yes' | 'no';
  contact?: string;
}

/**
 * Filters above an account register, as a plain GET form so it works without
 * JavaScript. Only the filters the source supports are shown.
 */
export function RegisterFilters({
  action,
  value,
  supports,
  contactName,
}: {
  action: string;
  value: RegisterFilterValues;
  supports: { direction?: boolean; reconciled?: boolean; contact?: boolean };
  /** Name of the contact being filtered on, for the "Contact: …" chip. */
  contactName?: string;
}) {
  const active =
    value.search || value.from || value.to || value.direction || value.reconciled || value.contact;
  const withoutContact = new URLSearchParams(
    Object.entries({ ...value, contact: undefined }).filter((e): e is [string, string] => !!e[1])
  ).toString();
  return (
    <form
      method="get"
      action={action}
      aria-label="Filter transactions"
      className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-4"
    >
      <Field label="Search" htmlFor="register-search" className="w-full sm:w-64">
        <Input
          id="register-search"
          name="search"
          type="search"
          placeholder="Reference"
          defaultValue={value.search}
        />
      </Field>
      <Field label="From" htmlFor="register-from" className="w-[calc(50%-0.375rem)] sm:w-40">
        <Input id="register-from" name="from" type="date" defaultValue={value.from} />
      </Field>
      <Field label="To" htmlFor="register-to" className="w-[calc(50%-0.375rem)] sm:w-40">
        <Input id="register-to" name="to" type="date" defaultValue={value.to} />
      </Field>
      {supports.direction && (
        <Field label="Show" htmlFor="register-direction" className="w-[calc(50%-0.375rem)] sm:w-36">
          <Select id="register-direction" name="direction" defaultValue={value.direction ?? ''}>
            <option value="">All</option>
            <option value="spent">Spent</option>
            <option value="received">Received</option>
          </Select>
        </Field>
      )}
      {supports.reconciled && (
        <Field
          label="Reconciled"
          htmlFor="register-reconciled"
          className="w-[calc(50%-0.375rem)] sm:w-40"
        >
          <Select id="register-reconciled" name="reconciled" defaultValue={value.reconciled ?? ''}>
            <option value="">Any</option>
            <option value="yes">Reconciled</option>
            <option value="no">Unreconciled</option>
          </Select>
        </Field>
      )}
      {value.contact && <input type="hidden" name="contact" value={value.contact} />}
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <Button type="submit" variant="primary">
          Apply
        </Button>
        {active && (
          <Link href={action} className="text-muted hover:text-ink px-2 text-sm underline">
            Clear filters
          </Link>
        )}
      </div>
      {supports.contact && value.contact && (
        <div className="w-full">
          <span className="bg-surface-3 border-line-strong text-body inline-flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-3 text-xs">
            Contact: {contactName ?? 'selected contact'}
            <Link
              href={withoutContact ? `${action}?${withoutContact}` : action}
              aria-label="Remove contact filter"
              className="hover:bg-surface-2 rounded-full p-0.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </span>
        </div>
      )}
    </form>
  );
}
