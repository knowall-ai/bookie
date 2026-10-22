'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { mailSetup } from '@/lib/email/mailbox';
import type { EmailSettings as Settings } from '@/lib/config/types';
import type { MailAgent, SharedMailbox } from '@/lib/email/types';
import { Mail } from 'lucide-react';
import { saveEmailSettingsAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/** Settings › Email: agents and the shared mailboxes they triage. */
export function EmailSettings(props: Settings) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = mailSetup(props);
  const emptyAgent = { id: '', displayName: '', mailbox: '' };
  const [agents, setAgents] = useState<MailAgent[]>(
    initial.agents.length ? initial.agents : [emptyAgent]
  );
  const storedAgents = agents.filter((a) => a.displayName || a.mailbox || a.teamsUser);
  const updateAgent = (index: number, patch: Partial<MailAgent>) => {
    setAgents(agents.map((agent, i) => (i === index ? { ...agent, ...patch } : agent)));
  };
  const nameAgent = (index: number, displayName: string) => {
    const agent = agents[index];
    const base =
      displayName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 32) || 'agent';
    let id = base;
    for (let suffix = 2; agents.some((a, i) => i !== index && a.id === id); suffix++)
      id = base.slice(0, 32 - String(suffix).length - 1) + '-' + suffix;
    updateAgent(index, { displayName, id });
    if (agent.id)
      setRows(rows.map((row) => (row.agentId === agent.id ? { ...row, agentId: id } : row)));
  };
  const [rows, setRows] = useState<SharedMailbox[]>(initial.sharedMailboxes);
  const [saved, setSaved] = useState(JSON.stringify([initial.agents, initial.sharedMailboxes]));
  const changed = JSON.stringify([storedAgents, rows]) !== saved;
  const update = (index: number, patch: Partial<SharedMailbox>) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

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
            The{' '}
            <Link href="/portal/emails" className="text-brand-bright hover:underline">
              Email
            </Link>{' '}
            tab shows held external emails for moderators to approve or reject; people with access
            to each shared mailbox see it, as Exchange allows. The portal stores only these
            settings.
          </p>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await saveEmailSettingsAction({
                  agents: storedAgents,
                  sharedMailboxes: rows,
                });
                if (!result.ok) return void toast.error(result.error);
                // Show what was stored: the server trims and lower-cases addresses.
                setAgents(result.data.agents?.length ? result.data.agents : [emptyAgent]);
                setRows(result.data.sharedMailboxes ?? []);
                setSaved(
                  JSON.stringify([result.data.agents ?? [], result.data.sharedMailboxes ?? []])
                );
                toast.success('Email settings saved');
                router.refresh();
              });
            }}
          >
            <fieldset disabled={pending} className="space-y-3">
              <legend className="text-ink font-medium">Agents</legend>
              <p className="text-muted text-xs">
                The AI agents whose outgoing email is held for approval. Most organisations have
                one.
              </p>
              {agents.map((agent, index) => (
                <div
                  key={index}
                  className="border-line grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                >
                  <Field label={`Agent ${index + 1} name`} htmlFor={`agent-name-${index}`}>
                    <Input
                      id={`agent-name-${index}`}
                      maxLength={40}
                      value={agent.displayName}
                      onChange={(e) => nameAgent(index, e.target.value)}
                    />
                  </Field>
                  <Field label={`Agent ${index + 1} mailbox`} htmlFor={`agent-mailbox-${index}`}>
                    <Input
                      id={`agent-mailbox-${index}`}
                      type="email"
                      value={agent.mailbox}
                      onChange={(e) => updateAgent(index, { mailbox: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={`Agent ${index + 1} Teams user (optional)`}
                    htmlFor={`agent-teams-${index}`}
                  >
                    <Input
                      id={`agent-teams-${index}`}
                      type="email"
                      value={agent.teamsUser ?? ''}
                      onChange={(e) =>
                        updateAgent(index, { teamsUser: e.target.value || undefined })
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      const remaining = agents.filter((_, i) => i !== index);
                      setAgents(remaining.length ? remaining : [emptyAgent]);
                      setRows(
                        rows.map((row) =>
                          row.agentId === agent.id ? { ...row, agentId: undefined } : row
                        )
                      );
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                disabled={agents.length >= 10}
                onClick={() => setAgents([...agents, emptyAgent])}
              >
                Add
              </Button>
            </fieldset>
            <fieldset disabled={pending} className="space-y-3">
              <legend className="text-ink font-medium">Shared mailboxes</legend>
              <p className="text-muted text-xs">
                Shared mailboxes, such as accounts@. Each gets a tab under Email; people see the
                ones Exchange lets them open.
              </p>
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="border-line grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                >
                  <Field label={`Mailbox ${index + 1} address`} htmlFor={`mailbox-${index}`}>
                    <Input
                      id={`mailbox-${index}`}
                      type="email"
                      required
                      value={row.address}
                      onChange={(e) => update(index, { address: e.target.value })}
                    />
                  </Field>
                  <Field label={`Mailbox ${index + 1} label (optional)`} htmlFor={`label-${index}`}>
                    <Input
                      id={`label-${index}`}
                      maxLength={40}
                      value={row.label ?? ''}
                      onChange={(e) => update(index, { label: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={`Mailbox ${index + 1} agent`}
                    htmlFor={`mailbox-agent-${index}`}
                    hint="The agent that reads this mailbox and suggests what to do."
                  >
                    <select
                      id={`mailbox-agent-${index}`}
                      className="border-line bg-surface text-ink rounded-lg border p-2"
                      value={row.agentId ?? ''}
                      onChange={(e) => update(index, { agentId: e.target.value || undefined })}
                    >
                      <option value="">None</option>
                      {storedAgents
                        .filter((a) => a.id)
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.displayName}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <label className="text-body flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="capture"
                      checked={!!row.capture}
                      onChange={() =>
                        setRows(
                          rows.map((item, i) => ({
                            ...item,
                            capture: i === index ? true : undefined,
                          }))
                        )
                      }
                    />
                    Bill capture files here
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <p className="text-muted text-xs">
                Bill capture files emails into the configured capture folders under this
                mailbox&apos;s Inbox.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={rows.length >= 10}
                  onClick={() => setRows([...rows, { address: '' }])}
                >
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!rows.some((row) => row.capture)}
                  onClick={() => setRows(rows.map((row) => ({ ...row, capture: undefined })))}
                >
                  Clear bill capture
                </Button>
              </div>
            </fieldset>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" size="sm" disabled={pending || !changed}>
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
