'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Bot, Inbox, Mail, Trash2 } from 'lucide-react';
import { mailSetup } from '@/lib/email/mailbox';
import type { EmailSettings as Settings } from '@/lib/config/types';
import type { MailAgent, SharedMailbox } from '@/lib/email/types';
import type { DirectoryPerson } from '@/lib/directory/types';
import { saveEmailSettingsAction, searchDirectoryAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Field, Input } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';

const MAX_ROWS = 10;
/** The server's own rule (`email-settings-schema.ts`), so a typed address is never accepted here and refused on Save. */
const email = z.string().trim().max(320).email();

/** A stable id from the agent's name: lower-case letters, digits and dashes, unique in the list. */
function agentId(displayName: string, taken: string[]): string {
  const base =
    displayName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'agent';
  let id = base;
  for (let suffix = 2; taken.includes(id); suffix++)
    id = base.slice(0, 32 - String(suffix).length - 1) + '-' + suffix;
  return id;
}

function DirectoryOption({ person }: { person: DirectoryPerson }) {
  return (
    <div className="min-w-0">
      <p className="text-ink truncate text-sm font-medium">{person.name}</p>
      <p className="text-muted truncate text-xs">{person.email}</p>
    </div>
  );
}

/**
 * Pick a mailbox from the organisation's directory (people and shared mailboxes are both
 * there), or type the address when search isn't available.
 */
function MailboxPicker({
  label,
  placeholder,
  taken,
  onPick,
  testId,
}: {
  label: string;
  placeholder: string;
  taken: string[];
  onPick: (address: string, name?: string) => void;
  testId: string;
}) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const typedError =
    typed && !email.safeParse(typed).success
      ? 'Use the full address, such as accounts@yourcompany.com.'
      : taken.includes(typed.trim().toLowerCase())
        ? 'That address is already listed.'
        : undefined;

  const add = () => {
    onPick(typed.trim().toLowerCase());
    setTyped('');
    setTyping(false);
  };

  if (typing)
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Field label={label} htmlFor={`${testId}-typed`} error={typedError} className="flex-1">
          <Input
            id={`${testId}-typed`}
            type="email"
            autoFocus
            placeholder={placeholder}
            value={typed}
            aria-invalid={typedError ? true : undefined}
            aria-describedby={typedError ? `${testId}-typed-error` : undefined}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the address; it must never submit (and save) the whole form.
              if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (typed && !typedError) add();
            }}
          />
        </Field>
        <div className="flex gap-2 sm:mt-7">
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={!typed || !!typedError}
            onClick={add}
          >
            Add
          </Button>
          <Button type="button" size="sm" onClick={() => setTyping(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );

  return (
    <div>
      <Combobox<DirectoryPerson>
        label={label}
        placeholder="Search your directory by name or email"
        testId={testId}
        search={searchDirectoryAction}
        getKey={(p) => p.id}
        renderOption={(p) => <DirectoryOption person={p} />}
        onSelect={(p) => {
          const address = p.email.toLowerCase();
          if (taken.includes(address)) {
            toast.error(`${p.email} is already listed.`);
            return false;
          }
          onPick(address, p.name);
          return true;
        }}
        emptyText="No one in your directory matches."
      />
      <button
        type="button"
        className="text-brand-bright mt-1.5 text-xs hover:underline"
        onClick={() => setTyping(true)}
      >
        Or type the address
      </button>
    </div>
  );
}

/** The address's Microsoft 365 photo, over an icon until (and unless) it loads. */
function DirectoryPhoto({ address, icon }: { address: string; icon: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const img = useRef<HTMLImageElement>(null);
  // The image can finish (or 404) before hydration attaches onLoad/onError.
  useEffect(() => {
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);
  return (
    <span className="bg-surface-3 text-muted relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
      {icon}
      {state !== 'failed' && (
        // A plain <img>: a tiny private image from our own route, and it needs onError for the fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={`/api/directory/photo?user=${encodeURIComponent(address)}`}
          alt=""
          draggable={false}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}

/** The photo, name and address heading one agent or mailbox card, with its remove button. */
function CardHeader({
  icon,
  title,
  address,
  removeLabel,
  onRemove,
}: {
  icon: React.ReactNode;
  title: string;
  address: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <DirectoryPhoto address={address} icon={icon} />
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate font-medium">{title}</p>
        {title !== address && <p className="text-muted truncate text-xs">{address}</p>}
      </div>
      <Button type="button" size="sm" variant="ghost" aria-label={removeLabel} onClick={onRemove}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Settings › Email: agents and the shared mailboxes they triage. */
export function EmailSettings(props: Settings) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = mailSetup(props);
  const [agents, setAgents] = useState<MailAgent[]>(initial.agents);
  // A mailbox can name an agent that's gone (the shape is shared with other portals): show it
  // as "No agent" and let Save store that, rather than send an id the server refuses.
  const [rows, setRows] = useState<SharedMailbox[]>(() =>
    initial.sharedMailboxes.map((row) =>
      row.agentId && !initial.agents.some((a) => a.id === row.agentId)
        ? { ...row, agentId: undefined }
        : row
    )
  );
  const [saved, setSaved] = useState(JSON.stringify([initial.agents, initial.sharedMailboxes]));
  const changed = JSON.stringify([agents, rows]) !== saved;
  const named = agents.filter((a) => a.displayName.trim());
  const incomplete = agents.length !== named.length;

  const updateAgent = (index: number, patch: Partial<MailAgent>) =>
    setAgents(agents.map((agent, i) => (i === index ? { ...agent, ...patch } : agent)));
  const renameAgent = (index: number, displayName: string) => {
    const agent = agents[index];
    const id = agentId(
      displayName,
      agents.filter((_, i) => i !== index).map((a) => a.id)
    );
    updateAgent(index, { displayName, id });
    setRows(rows.map((row) => (row.agentId === agent.id ? { ...row, agentId: id } : row)));
  };
  const addAgent = (mailbox: string, name?: string) => {
    const displayName = (name ?? mailbox.split('@')[0]).slice(0, 40);
    const agent = {
      id: agentId(
        displayName,
        agents.map((a) => a.id)
      ),
      displayName,
      mailbox,
    };
    setAgents([...agents, agent]);
    // The first agent reads the mailboxes nobody has been given yet: most organisations have one.
    if (!agents.length) setRows(rows.map((row) => ({ ...row, agentId: row.agentId ?? agent.id })));
  };
  const removeAgent = (index: number) => {
    const agent = agents[index];
    setAgents(agents.filter((_, i) => i !== index));
    setRows(rows.map((row) => (row.agentId === agent.id ? { ...row, agentId: undefined } : row)));
  };
  const updateRow = (index: number, patch: Partial<SharedMailbox>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const addRow = (address: string, name?: string) =>
    setRows([
      ...rows,
      {
        address,
        ...(name ? { label: name.slice(0, 40) } : {}),
        ...(agents.length === 1 ? { agentId: agents[0].id } : {}),
      },
    ]);
  const setCapture = (index: number, on: boolean) =>
    setRows(rows.map((row, i) => ({ ...row, capture: on && i === index ? true : undefined })));

  return (
    <section id="email" className="card p-5" aria-labelledby="email-title">
      <div className="flex items-start gap-4">
        <span className="bg-brand/10 text-brand-bright flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <Mail className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <h2 id="email-title" className="text-ink text-lg font-semibold">
            Email
          </h2>
          <p className="text-muted mt-1">
            What the{' '}
            <Link href="/portal/emails" className="text-brand-bright hover:underline">
              Email
            </Link>{' '}
            tab shows: emails your agents send outside the organisation, held for an approver, and
            your shared mailboxes. Exchange still decides who can approve and who can open each
            mailbox. The portal stores only these settings.
          </p>
          <form
            className="mt-5 grid gap-6 lg:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await saveEmailSettingsAction({ agents, sharedMailboxes: rows });
                if (!result.ok) return void toast.error(result.error);
                // Show what was stored: the server trims and lower-cases addresses.
                const stored = [result.data.agents ?? [], result.data.sharedMailboxes ?? []];
                setAgents(stored[0] as MailAgent[]);
                setRows(stored[1] as SharedMailbox[]);
                setSaved(JSON.stringify(stored));
                toast.success('Email settings saved');
                router.refresh();
              });
            }}
          >
            <fieldset disabled={pending} className="space-y-3">
              <legend className="text-ink font-medium">Agents</legend>
              <p className="text-muted text-xs">
                AI agents with their own Microsoft 365 account, such as Bookie. Their emails to
                people outside the organisation wait for approval.
              </p>
              {agents.map((agent, index) => (
                <div
                  key={agent.mailbox}
                  className="border-line space-y-3 rounded-lg border p-3"
                  data-testid="agent-card"
                >
                  <CardHeader
                    icon={<Bot className="h-4 w-4" aria-hidden="true" />}
                    title={agent.displayName || 'Unnamed agent'}
                    address={agent.mailbox}
                    removeLabel={`Remove ${agent.displayName || agent.mailbox}`}
                    onRemove={() => removeAgent(index)}
                  />
                  <p className="text-faint text-xs">
                    Teams calls go to {agent.teamsUser ?? agent.mailbox}.
                  </p>
                  <Field
                    label="Name"
                    htmlFor={`agent-name-${index}`}
                    error={agent.displayName.trim() ? undefined : 'Give the agent a name.'}
                  >
                    <Input
                      id={`agent-name-${index}`}
                      aria-invalid={agent.displayName.trim() ? undefined : true}
                      aria-describedby={
                        agent.displayName.trim() ? undefined : `agent-name-${index}-error`
                      }
                      maxLength={40}
                      value={agent.displayName}
                      onChange={(e) => renameAgent(index, e.target.value)}
                    />
                  </Field>
                </div>
              ))}
              {agents.length < MAX_ROWS && (
                <MailboxPicker
                  label={agents.length ? 'Add another agent' : 'Add an agent'}
                  placeholder="bookie@yourcompany.com"
                  taken={agents.map((a) => a.mailbox)}
                  onPick={addAgent}
                  testId="agent-picker"
                />
              )}
            </fieldset>

            <fieldset disabled={pending} className="space-y-3">
              <legend className="text-ink font-medium">Shared mailboxes</legend>
              <p className="text-muted text-xs">
                Mailboxes such as accounts@. Each gets a tab under Email, for the people Exchange
                lets open it.
              </p>
              {rows.map((row, index) => (
                <div
                  key={row.address}
                  className="border-line space-y-3 rounded-lg border p-3"
                  data-testid="mailbox-card"
                >
                  <CardHeader
                    icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
                    title={row.label || row.address}
                    address={row.address}
                    removeLabel={`Remove ${row.address}`}
                    onRemove={() => setRows(rows.filter((_, i) => i !== index))}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Tab name" htmlFor={`label-${index}`}>
                      <Input
                        id={`label-${index}`}
                        maxLength={40}
                        placeholder={row.address.split('@')[0]}
                        value={row.label ?? ''}
                        onChange={(e) => updateRow(index, { label: e.target.value || undefined })}
                      />
                    </Field>
                    <Field label="Read by" htmlFor={`mailbox-agent-${index}`}>
                      <select
                        id={`mailbox-agent-${index}`}
                        className="border-line-strong bg-surface text-ink h-10 rounded-lg border px-2 text-sm"
                        value={row.agentId ?? ''}
                        onChange={(e) => updateRow(index, { agentId: e.target.value || undefined })}
                      >
                        <option value="">No agent</option>
                        {named.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.displayName}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body text-sm font-medium">Bill capture</p>
                      <p className="text-faint text-xs">
                        {row.capture
                          ? named.some((a) => a.id === row.agentId)
                            ? `Bills and receipts arrive here. ${named.find((a) => a.id === row.agentId)?.displayName} files them and checks them against the books.`
                            : 'Bills and receipts arrive here. Choose an agent to read this mailbox, and it files them.'
                          : 'Turn on for the mailbox suppliers send bills to. Only one mailbox at a time.'}
                      </p>
                    </div>
                    <Toggle
                      checked={!!row.capture}
                      label={`Bill capture for ${row.address}`}
                      onChange={(on) => setCapture(index, on)}
                    />
                  </div>
                </div>
              ))}
              {rows.length < MAX_ROWS && (
                <MailboxPicker
                  label={rows.length ? 'Add another shared mailbox' : 'Add a shared mailbox'}
                  placeholder="accounts@yourcompany.com"
                  taken={rows.map((r) => r.address)}
                  onPick={addRow}
                  testId="mailbox-picker"
                />
              )}
            </fieldset>

            <div className="flex items-center gap-3 lg:col-span-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={pending || !changed || incomplete}
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
              {changed && !pending && <span className="text-faint text-xs">Unsaved changes</span>}
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
