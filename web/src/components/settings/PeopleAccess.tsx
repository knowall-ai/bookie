'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Trash2, UserPlus, Users } from 'lucide-react';
import {
  removeAccessPersonAction,
  saveAccessPersonAction,
  setMembersSeeAllAction,
} from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Input } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';

export interface AccessOrgOption {
  key: string;
  name: string;
  sourceLabel: string;
  /** A Business Central company hidden from the switcher in Settings. */
  hidden: boolean;
}

export interface AccessPersonRow {
  email: string;
  name?: string;
  orgKeys: string[] | 'all';
}

function sameKeys(a: string[] | 'all', b: string[] | 'all') {
  if (a === 'all' || b === 'all') return a === b;
  return a.length === b.length && a.every((k) => b.includes(k));
}

function PersonCard({
  person,
  orgs,
  onRemove,
}: {
  person: AccessPersonRow;
  orgs: AccessOrgOption[];
  onRemove: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [orgKeys, setOrgKeys] = useState<string[] | 'all'>(person.orgKeys);
  const dirty = !sameKeys(orgKeys, person.orgKeys);
  const all = orgKeys === 'all';
  const granted = all ? orgs.length : orgs.filter((o) => orgKeys.includes(o.key)).length;
  const id = person.email.replace(/[^a-z0-9]/gi, '-');

  const toggle = (key: string, on: boolean) => {
    if (orgKeys === 'all') return;
    setOrgKeys(on ? [...orgKeys, key] : orgKeys.filter((k) => k !== key));
  };

  const save = () =>
    start(async () => {
      const result = await saveAccessPersonAction({ ...person, orgKeys });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Access updated for ${person.name || person.email}`);
      router.refresh();
    });

  return (
    <li
      className="border-line rounded-xl border p-4"
      data-testid="access-person"
      data-email={person.email}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="text-ink font-medium break-words">{person.name || person.email}</p>
          {person.name && <p className="text-muted text-xs break-all">{person.email}</p>}
        </div>
        <Badge tone={granted === 0 ? 'amber' : 'green'}>
          {all
            ? 'All organisations'
            : granted === 0
              ? 'No organisations'
              : `${granted} organisation${granted === 1 ? '' : 's'}`}
        </Badge>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label={`Remove ${person.name || person.email}`}
        >
          <Trash2 className="h-4 w-4" /> Remove
        </Button>
      </div>

      <fieldset className="mt-3" aria-describedby={`${id}-hint`}>
        <legend className="sr-only">Organisations {person.name || person.email} can open</legend>
        <label className="hover:bg-surface-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2">
          <input
            type="checkbox"
            className="accent-brand h-4 w-4"
            checked={all}
            onChange={(e) => setOrgKeys(e.target.checked ? 'all' : [])}
          />
          <span className="text-ink text-sm">All organisations, including ones added later</span>
        </label>
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <li key={org.key}>
              <label className="hover:bg-surface-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                <input
                  type="checkbox"
                  className="accent-brand h-4 w-4"
                  disabled={all}
                  checked={all || orgKeys.includes(org.key)}
                  onChange={(e) => toggle(org.key, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="text-ink block truncate text-sm">{org.name}</span>
                  <span className="text-faint block truncate text-xs">
                    {org.sourceLabel}
                    {org.hidden && ' · hidden from the switcher'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p id={`${id}-hint`} className="sr-only">
          Tick the organisations this person can open in Bookie.
        </p>
      </fieldset>

      {dirty && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOrgKeys(person.orgKeys)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={pending} onClick={save}>
            {pending ? 'Saving…' : 'Save access'}
          </Button>
        </div>
      )}
    </li>
  );
}

/** Settings › People and access. Shown to members only. */
export function PeopleAccess({
  orgName,
  people,
  membersSeeAll,
  orgs,
}: {
  /** The tenant's name ("Contoso"), or undefined when Microsoft 365 didn't say. */
  orgName?: string;
  people: AccessPersonRow[];
  membersSeeAll: boolean;
  orgs: AccessOrgOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ email: '', name: '' });
  const [removing, setRemoving] = useState<AccessPersonRow | null>(null);
  const tenant = orgName ?? 'your organisation';

  const add = () =>
    start(async () => {
      const result = await saveAccessPersonAction({ ...form, orgKeys: [] });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Added ${form.name || form.email}. Tick the organisations they can open.`);
      setForm({ email: '', name: '' });
      router.refresh();
    });

  const remove = (person: AccessPersonRow) =>
    start(async () => {
      const result = await removeAccessPersonAction(person.email);
      setRemoving(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Removed ${person.name || person.email}`);
      router.refresh();
    });

  return (
    <section className="card overflow-hidden" aria-labelledby="access-title">
      <div className="border-line flex items-start gap-4 border-b p-5">
        <span className="bg-brand/10 text-brand-bright flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="access-title" className="text-ink text-lg font-semibold">
            People and access
          </h2>
          <p className="text-muted mt-0.5 text-sm">
            Choose which organisations each person can open in Bookie.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="text-muted space-y-2 text-sm">
          <p>
            <span className="text-ink font-medium">
              Guests see nothing until they’re listed here.
            </span>{' '}
            A guest is someone from outside {tenant} you’ve invited to your Microsoft 365, such as
            your external accountant. They sign in with “Accountant or guest of {tenant}?” and only
            see the organisations you tick for them.
          </p>
          <p>
            Business Central still applies each person’s own Business Central permissions: ticking a
            company here can’t give anyone more than Business Central allows them.
          </p>
        </div>

        <div className="bg-surface-2/60 border-line flex items-center gap-4 rounded-xl border p-4">
          <div className="min-w-0 flex-1">
            <p className="text-ink text-sm font-medium" id="members-see-all-label">
              Everyone in {tenant} can see all organisations
            </p>
            <p className="text-muted mt-0.5 text-xs">
              {membersSeeAll
                ? 'Members of your Microsoft 365 see every organisation. Entries below apply to guests.'
                : 'Members see only the organisations ticked for them below. Members can always open Settings.'}
            </p>
          </div>
          <Toggle
            label={`Everyone in ${tenant} can see all organisations`}
            checked={membersSeeAll}
            disabled={pending}
            testId="toggle-membersSeeAll"
            onChange={(value) =>
              start(async () => {
                const result = await setMembersSeeAllAction(value);
                if (!result.ok) toast.error(result.error);
                else
                  toast.success(
                    value
                      ? 'Members now see all organisations'
                      : 'Members now see only what they’re given'
                  );
                router.refresh();
              })
            }
          />
        </div>

        {people.length > 0 ? (
          <ul className="space-y-3" data-testid="access-people">
            {people.map((person) => (
              <PersonCard
                key={`${person.email}:${JSON.stringify(person.orgKeys)}`}
                person={person}
                orgs={orgs}
                onRemove={() => setRemoving(person)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-faint text-sm">
            Nobody has been given access yet. Guests can sign in but won’t see any organisations.
          </p>
        )}

        <form
          className="bg-surface-2/60 border-line grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          aria-label="Add a person"
        >
          <Field label="Email" htmlFor="access-email" hint="The address they sign in with">
            <Input
              id="access-email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="accountant@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Name" htmlFor="access-name">
            <Input
              id="access-name"
              autoComplete="off"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="flex items-start sm:pt-7">
            <Button type="submit" variant="secondary" disabled={pending} data-testid="add-person">
              <UserPlus className="h-4 w-4" /> Add person
            </Button>
          </div>
        </form>
      </div>

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name || removing.email}?`}
          body={`${removing.name || removing.email} will lose the access listed here. A guest will no longer see any organisations in Bookie. Nothing in Xero or Business Central changes.`}
          cta="Remove"
          danger
          busy={pending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove(removing)}
        />
      )}
    </section>
  );
}
