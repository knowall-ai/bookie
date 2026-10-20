'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';
import { saveEmailSettingsAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

/** Settings › Bookie's emails: his address (for held email) and the accounts mailbox. */
export function EmailSettings({
  agentAddress,
  accountsMailbox,
}: {
  agentAddress?: string;
  accountsMailbox?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [agent, setAgent] = useState(agentAddress ?? '');
  const [accounts, setAccounts] = useState(accountsMailbox ?? '');
  const changed = agent !== (agentAddress ?? '') || accounts !== (accountsMailbox ?? '');

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
            access to the accounts mailbox see it, as Exchange allows. Bookie stores only these two
            addresses.
          </p>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await saveEmailSettingsAction({
                  agentAddress: agent,
                  accountsMailbox: accounts,
                });
                if (!result.ok) return void toast.error(result.error);
                toast.success('Email settings saved');
                router.refresh();
              });
            }}
          >
            <Field
              label="Bookie’s email address"
              htmlFor="email-agent"
              hint="His own mailbox, such as bookie@yourcompany.com."
            >
              <Input
                id="email-agent"
                type="email"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="bookie@example.com"
                autoComplete="off"
              />
            </Field>
            <Field
              label="Accounts mailbox"
              htmlFor="email-accounts"
              hint="The shared mailbox bill capture reads, such as accounts@."
            >
              <Input
                id="email-accounts"
                type="email"
                value={accounts}
                onChange={(e) => setAccounts(e.target.value)}
                placeholder="accounts@example.com"
                autoComplete="off"
              />
            </Field>
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
