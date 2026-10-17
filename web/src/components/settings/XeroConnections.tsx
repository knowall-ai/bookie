'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { KeyRound, Link2, Trash2 } from 'lucide-react';
import { addCustomConnectionAction, removeConnectionAction } from '@/lib/portal/actions/settings';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/ui/format';

export interface ConnectionSummary {
  id: string;
  label: string;
  type: 'custom-connection' | 'oauth';
  orgs: { name: string; country?: string; baseCurrency?: string }[];
  createdBy: string;
  createdAt: string;
}

export function XeroConnections({
  connections,
  oauthConfigured,
}: {
  connections: ConnectionSummary[];
  oauthConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(connections.length === 0 && !oauthConfigured);
  const [form, setForm] = useState({ label: '', clientId: '', clientSecret: '' });
  const [removing, setRemoving] = useState<ConnectionSummary | null>(null);

  const add = () =>
    start(async () => {
      const result = await addCustomConnectionAction(form);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Connected ${result.data.orgs.join(', ')}`);
      setForm({ label: '', clientId: '', clientSecret: '' });
      setShowForm(false);
      router.refresh();
    });

  const remove = (connection: ConnectionSummary) =>
    start(async () => {
      const result = await removeConnectionAction(connection.id);
      setRemoving(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success('Connection removed');
      router.refresh();
    });

  return (
    <div className="p-5">
      {connections.length > 0 && (
        <ul className="divide-line mb-5 divide-y" data-testid="xero-connections">
          {connections.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink font-medium">
                  {c.orgs.map((o) => o.name).join(', ') || c.label}
                </p>
                <p className="text-muted mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone={c.type === 'oauth' ? 'blue' : 'violet'}>
                    {c.type === 'oauth' ? 'Connected with Xero' : 'Custom Connection'}
                  </Badge>
                  Added by {c.createdBy} on {formatDate(c.createdAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRemoving(c)}
                aria-label={`Remove ${c.label}`}
              >
                <Trash2 className="h-4 w-4" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {oauthConfigured ? (
          <a href="/api/xero/connect" className="inline-flex">
            <Button variant="primary" tabIndex={-1}>
              <Link2 className="h-4 w-4" /> Connect to Xero
            </Button>
          </a>
        ) : (
          <p className="text-faint w-full text-xs">
            “Connect to Xero” sign-in isn’t configured on this server yet. You can still add Custom
            Connection keys.
          </p>
        )}
        {!showForm && (
          <Button
            variant="secondary"
            onClick={() => setShowForm(true)}
            data-testid="add-custom-connection"
          >
            <KeyRound className="h-4 w-4" /> Add Custom Connection keys
          </Button>
        )}
      </div>

      {showForm && (
        <form
          className="bg-surface-2/60 border-line mt-5 grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="text-muted text-sm sm:col-span-2">
            <p className="text-ink font-medium">Add a Xero Custom Connection</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                In{' '}
                <a
                  className="text-brand-bright hover:underline"
                  href="https://developer.xero.com/app/manage"
                  target="_blank"
                  rel="noreferrer"
                >
                  Xero Developer › My Apps
                </a>
                , create a Custom Connection for your organisation.
              </li>
              <li>
                Give it the accounting, reports, payroll, projects and assets scopes you want Bookie
                to see, and authorise it in Xero.
              </li>
              <li>
                Paste its Client ID and Client secret here. They are encrypted and stored in your
                own Microsoft 365.
              </li>
            </ol>
          </div>
          <Field label="Client ID" htmlFor="clientId">
            <Input
              id="clientId"
              autoComplete="off"
              spellCheck={false}
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              required
            />
          </Field>
          <Field label="Client secret" htmlFor="clientSecret">
            <Input
              id="clientSecret"
              type="password"
              autoComplete="new-password"
              value={form.clientSecret}
              onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
              required
            />
          </Field>
          <Field
            label="Name (optional)"
            htmlFor="label"
            hint="Defaults to the Xero organisation's name"
          >
            <Input
              id="label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </Field>
          <div className="flex items-end justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Checking with Xero…' : 'Connect'}
            </Button>
          </div>
        </form>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this Xero connection?"
          body={`${removing.orgs.map((o) => o.name).join(', ') || removing.label} will disappear from Bookie for everyone in your organisation. Nothing in Xero changes${removing.type === 'oauth' ? ', but Bookie’s access will be revoked' : ''}.`}
          cta="Remove"
          danger
          busy={pending}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove(removing)}
        />
      )}
    </div>
  );
}
