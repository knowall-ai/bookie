'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { mailSetup } from '@/lib/email/mailbox';
import type { EmailSettings as Settings } from '@/lib/config/types';
import type { SharedMailbox } from '@/lib/email/types';
import { Mail } from 'lucide-react';
import { saveEmailSettingsAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/** Settings › Bookie's emails: his address and the shared mailboxes he reads. */
export function EmailSettings(props: Settings) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const initial = mailSetup(props);
  const [agent, setAgent] = useState(initial.agentMailbox ?? '');
  const [rows, setRows] = useState<SharedMailbox[]>(initial.sharedMailboxes);
  const [saved, setSaved] = useState(
    JSON.stringify([initial.agentMailbox ?? '', initial.sharedMailboxes])
  );
  const changed = JSON.stringify([agent, rows]) !== saved;
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
            Bookie’s emails
          </h2>
          <p className="text-muted mt-1">
            Where{' '}
            <Link href="/portal/emails" className="text-brand-bright hover:underline">
              Bookie’s emails
            </Link>{' '}
            looks. Moderators see Bookie’s held external emails to approve or reject; people with
            access to each shared mailbox see it, as Exchange allows. Bookie stores only these
            settings.
          </p>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await saveEmailSettingsAction({
                  agentAddress: agent,
                  sharedMailboxes: rows,
                });
                if (!result.ok) return void toast.error(result.error);
                // Show what was stored: the server trims and lower-cases addresses.
                setAgent(result.data.agentAddress ?? '');
                setRows(result.data.sharedMailboxes ?? []);
                setSaved(
                  JSON.stringify([
                    result.data.agentAddress ?? '',
                    result.data.sharedMailboxes ?? [],
                  ])
                );
                toast.success('Email settings saved');
                router.refresh();
              });
            }}
          >
            <Field
              label="Bookie’s mailbox"
              htmlFor="email-agent"
              hint="His own Microsoft 365 mailbox, such as bookie@yourcompany.com."
            >
              <Input
                disabled={pending}
                id="email-agent"
                type="email"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="bookie@example.com"
                autoComplete="off"
              />
            </Field>
            <fieldset disabled={pending} className="space-y-3">
              <legend className="text-ink font-medium">Shared mailboxes</legend>
              <p className="text-muted text-xs">
                Mailboxes Bookie reads, such as accounts@. Each gets a tab under Email; people see
                the ones Exchange lets them open.
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
                Bill capture files emails into Bookie/Needs review and Bookie/Processed under this
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
