'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateSettingsAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';

export interface BcCompanyRow {
  key: string;
  name: string;
  environment: string;
  hidden: boolean;
}

export function BcCompanies({ companies }: { companies: BcCompanyRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState(
    () => new Set(companies.filter((c) => c.hidden).map((c) => c.key))
  );
  const dirty = companies.some((c) => c.hidden !== hidden.has(c.key));

  if (companies.length === 0) {
    return (
      <p className="text-muted p-5 text-sm">
        No Business Central companies were found for your account. Bookie looks in every environment
        in your Microsoft 365 tenant using your own Business Central permissions, so check you have
        a Business Central licence and access to at least one company.
      </p>
    );
  }

  const environments = [...new Set(companies.map((c) => c.environment))];
  return (
    <div className="p-5">
      <p className="text-muted mb-4 text-sm">
        Companies are found automatically with your own Business Central permissions. Untick any you
        don’t want in the organisation switcher (for example the CRONUS demo company).
      </p>
      {environments.map((env) => (
        <fieldset key={env} className="mb-4">
          <legend className="text-faint mb-2 text-xs font-semibold tracking-wider uppercase">
            Environment · {env}
          </legend>
          <ul className="space-y-1">
            {companies
              .filter((c) => c.environment === env)
              .map((c) => (
                <li key={c.key}>
                  <label className="hover:bg-surface-2 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2">
                    <input
                      type="checkbox"
                      className="accent-brand h-4 w-4"
                      checked={!hidden.has(c.key)}
                      onChange={(e) => {
                        const next = new Set(hidden);
                        if (e.target.checked) next.delete(c.key);
                        else next.add(c.key);
                        setHidden(next);
                      }}
                    />
                    <span className="text-ink text-sm">{c.name}</span>
                  </label>
                </li>
              ))}
          </ul>
        </fieldset>
      ))}
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const result = await updateSettingsAction({ hiddenCompanies: [...hidden] });
              if (!result.ok) return void toast.error(result.error);
              toast.success('Organisation switcher updated');
              router.refresh();
            })
          }
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
