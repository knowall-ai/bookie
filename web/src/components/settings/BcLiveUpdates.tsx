'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Activity } from 'lucide-react';
import { setBcLiveUpdatesAction } from '@/lib/portal/actions/live';
import { Toggle } from '@/components/ui/Toggle';

/** Settings › Business Central › Live updates (BC webhook subscriptions). */
export function BcLiveUpdates({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  return (
    <div className="border-line flex items-start gap-4 border-t p-5">
      <span className="bg-brand/10 text-brand-bright flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Activity className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <h3 className="text-ink font-semibold">Live updates</h3>
        <p className="text-muted mt-0.5">
          Business Central tells Bookie when sales invoices, purchase invoices and customers change,
          so Home shows them as they happen. Bookie keeps only the ids, in memory, for an hour.
        </p>
        {!configured && (
          <p className="text-faint mt-2 text-xs">
            Not set up for this Bookie installation: it needs a public HTTPS address and
            BOOKIE_WEBHOOK_SECRET (see docs/WEBHOOKS.adoc).
          </p>
        )}
      </div>
      <Toggle
        label="Live updates from Business Central"
        checked={on}
        disabled={pending || (!configured && !on)}
        testId="toggle-bc-live"
        onChange={(value) =>
          start(async () => {
            const result = await setBcLiveUpdatesAction(value);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            setOn(value);
            toast.success(
              value
                ? `Live updates on for ${result.data.companies} ${result.data.companies === 1 ? 'company' : 'companies'}`
                : 'Live updates off'
            );
            router.refresh();
          })
        }
      />
    </div>
  );
}
