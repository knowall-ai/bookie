'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Trash2, TriangleAlert, Users } from 'lucide-react';
import {
  addAccessPersonAction,
  removeAccessPersonAction,
  saveAccessPersonAction,
  searchDirectoryAction,
  setMembersSeeAllAction,
} from '@/lib/portal/actions/settings';
import {
  ENTRA_ENTERPRISE_APPS_URL,
  type DirectoryPerson,
  type SignInStatus,
} from '@/lib/directory/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Combobox } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Toggle } from '@/components/ui/Toggle';

export interface AccessOrgOption {
  key: string;
  name: string;
  sourceLabel: string;
  /** A Business Central company hidden from the switcher in Settings. */
  hidden: boolean;
}

export interface AccessPersonRow {
  /** Entra object id; missing on entries added before the directory picker (matched by email). */
  userId?: string;
  email: string;
  name?: string;
  orgKeys: string[] | 'all';
  /** From the app-assignment check; missing when Bookie couldn't tell. */
  signIn?: SignInStatus;
}

function rowKey(person: { userId?: string; email: string }) {
  return person.userId ?? person.email.toLowerCase();
}

/** The listed person can't sign in until an administrator assigns them to Bookie in Entra. */
function SignInHint() {
  return (
    <p
      className="border-warn/30 bg-warn/10 text-warn mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
      data-testid="sign-in-hint"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        Can’t sign in yet: an administrator needs to assign them to Bookie in Microsoft Entra.{' '}
        <a
          href={ENTRA_ENTERPRISE_APPS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        >
          Open Enterprise applications
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </span>
    </p>
  );
}

function DirectoryOption({ person, listed }: { person: DirectoryPerson; listed: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-sm font-medium">{person.name}</p>
        <p className="text-muted truncate text-xs">{person.email}</p>
      </div>
      {listed && <span className="text-faint text-xs whitespace-nowrap">Already listed</span>}
      <Badge tone={person.userType === 'Guest' ? 'violet' : 'neutral'}>{person.userType}</Badge>
    </div>
  );
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
  const id = `person-${rowKey(person).replace(/[^a-z0-9]/gi, '-')}`;

  const toggle = (key: string, on: boolean) => {
    if (orgKeys === 'all') return;
    setOrgKeys(on ? [...orgKeys, key] : orgKeys.filter((k) => k !== key));
  };

  const save = () =>
    start(async () => {
      const result = await saveAccessPersonAction({
        userId: person.userId,
        email: person.email,
        orgKeys,
      });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Access updated for ${person.name || person.email}`);
      router.refresh();
    });

  return (
    <li
      className="border-line rounded-xl border p-4"
      data-testid="access-person"
      data-email={person.email}
      data-user-id={person.userId}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-0">
          <p className="text-ink font-medium break-words">{person.name || person.email}</p>
          {person.name && <p className="text-muted text-xs break-all">{person.email}</p>}
          {!person.userId && (
            <p className="text-faint mt-0.5 text-xs">
              Matched by email. Find them in the directory below to link their Microsoft 365
              account.
            </p>
          )}
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

      {person.signIn === 'not-assigned' && <SignInHint />}

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
  const [removing, setRemoving] = useState<AccessPersonRow | null>(null);
  const tenant = orgName ?? 'your organisation';
  const listedIds = new Set(people.flatMap((p) => p.userId ?? []));
  const listedEmails = new Set(people.map((p) => p.email.toLowerCase()));
  const isListed = (p: DirectoryPerson) =>
    listedIds.has(p.id) || listedEmails.has(p.email.toLowerCase());

  const add = async (person: DirectoryPerson) => {
    const result = await addAccessPersonAction(person.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success(
      isListed(person)
        ? `${result.data.name} is already listed. Their Microsoft 365 account is linked.`
        : `Added ${result.data.name}. Tick the organisations they can open.`
    );
    start(() => router.refresh());
    return true;
  };

  const remove = (person: AccessPersonRow) =>
    start(async () => {
      const result = await removeAccessPersonAction({
        userId: person.userId,
        email: person.email,
      });
      setRemoving(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Removed ${person.name || person.email}`);
      router.refresh();
    });

  return (
    // No overflow-hidden: the people picker's list opens below the card's last row.
    <section className="card" aria-labelledby="access-title">
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
                key={`${rowKey(person)}:${JSON.stringify(person.orgKeys)}`}
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

        <div className="bg-surface-2/60 border-line rounded-xl border p-4">
          <Combobox<DirectoryPerson>
            label="Add a person"
            placeholder={`Search ${tenant}’s directory by name or email`}
            testId="people-picker"
            search={searchDirectoryAction}
            getKey={(p) => p.id}
            renderOption={(p) => <DirectoryOption person={p} listed={isListed(p)} />}
            onSelect={add}
            emptyText={`No one in ${tenant}’s directory matches. Invite guests in Microsoft Entra first.`}
          />
          <p className="text-faint mt-2 text-xs">
            Only people in your Microsoft 365 directory can be added. Invite an outside accountant
            as a guest in Microsoft Entra first.
          </p>
        </div>
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
