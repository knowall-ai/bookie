'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Mailbox } from 'lucide-react';
import { setAccountsMailboxAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

/** Settings › Accounts inbox: the shared mailbox suppliers send bills to. */
export function AccountsMailbox({ mailbox }: { mailbox?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(mailbox ?? '');
  const changed = value.trim().toLowerCase() !== (mailbox ?? '');
  return (
    <section id="accounts-inbox" className="card p-5" aria-labelledby="accounts-inbox-title">
      <div className="flex items-start gap-4">
        <span className="bg-brand/10 text-brand-bright flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
          <Mailbox className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <h2 id="accounts-inbox-title" className="text-ink text-lg font-semibold">
            Accounts inbox
          </h2>
          <p className="text-muted mt-1">
            The shared mailbox your suppliers send bills to. Purchases › Accounts inbox reads it
            live, as the person looking, and shows which invoices are suspicious, already in the
            books or ready to file. Bookie keeps only this address. Each person needs access to the
            mailbox in Microsoft 365, and an administrator must grant Bookie the Mail.Read.Shared
            permission (getbook.ie/install).
          </p>
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const result = await setAccountsMailboxAction(value);
                if (!result.ok) return void toast.error(result.error);
                toast.success(value.trim() ? 'Accounts mailbox saved' : 'Accounts mailbox removed');
                router.refresh();
              });
            }}
          >
            <label htmlFor="accounts-mailbox" className="sr-only">
              Accounts mailbox address
            </label>
            <Input
              id="accounts-mailbox"
              type="email"
              placeholder="accounts@yourcompany.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="max-w-sm"
              data-testid="accounts-mailbox-input"
            />
            <Button
              type="submit"
              disabled={pending || !changed}
              data-testid="accounts-mailbox-save"
            >
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
