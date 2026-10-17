'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Toggle } from '@/components/ui/Toggle';
import { updateSettingsAction } from '@/lib/portal/actions/settings';

/** A connector section with the on/off switch (like ZapDesk's source toggle). */
export function ConnectorCard({
  name,
  logo,
  description,
  enabled,
  setting,
  children,
}: {
  name: string;
  logo: React.ReactNode;
  description: string;
  enabled: boolean;
  setting: 'xeroEnabled' | 'bcEnabled';
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <section className="card overflow-hidden" aria-labelledby={`${setting}-title`}>
      <div className="border-line flex items-start gap-4 border-b p-5">
        <span className="shrink-0">{logo}</span>
        <div className="min-w-0 flex-1">
          <h2 id={`${setting}-title`} className="text-ink text-lg font-semibold">
            {name}
          </h2>
          <p className="text-muted mt-0.5 text-sm">{description}</p>
        </div>
        <Toggle
          label={`Use ${name}`}
          checked={enabled}
          disabled={pending}
          testId={`toggle-${setting}`}
          onChange={(value) =>
            start(async () => {
              const result = await updateSettingsAction({ [setting]: value });
              if (!result.ok) toast.error(result.error);
              else toast.success(`${name} ${value ? 'turned on' : 'turned off'}`);
              router.refresh();
            })
          }
        />
      </div>
      <div className={enabled ? '' : 'pointer-events-none opacity-50'}>{children}</div>
    </section>
  );
}
