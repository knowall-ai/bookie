import { KeyRound, MailQuestion, Settings2, UserLock } from 'lucide-react';
import { canManageSettings } from '@/lib/auth/access';
import { requireAuth } from '@/lib/auth/context';
import { getEmailsOverview } from '@/lib/email';
import { inboxLabel } from '@/lib/email/mailbox';
import type { EmailsOverview } from '@/lib/email/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { ApprovalsList } from '@/components/email/ApprovalsList';
import { MailboxList } from '@/components/email/MailboxList';

const CONSENT_DOC = 'See docs/DEPLOYMENT.adoc, “Email tab”.';

function SettingsLink() {
  return (
    <ButtonLink href="/portal/settings#email" variant="secondary">
      Open Settings
    </ButtonLink>
  );
}

function ApprovalsTab({
  view,
  agents,
}: {
  view: EmailsOverview['approvals'];
  agents: EmailsOverview['agents'];
}) {
  switch (view.status) {
    case 'not-configured':
      return (
        <EmptyState
          icon={<Settings2 className="h-6 w-6" />}
          title="No agents are configured"
          body="Add an agent’s mailbox in Settings so this page can find the emails Exchange holds for your approval."
          action={<SettingsLink />}
        />
      );
    case 'no-consent':
      return (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title="The portal can’t read approval requests yet"
          body={`An administrator needs to grant the portal the Mail.ReadWrite and Mail.Send permissions (delegated, admin consent). ${CONSENT_DOC}`}
        />
      );
    case 'error':
      return <ErrorPanel title="Couldn’t load the emails awaiting approval" message={view.error} />;
    case 'ok':
      return (
        <div className="space-y-3">
          {view.incomplete && (
            <p className="text-warn text-sm">
              More held emails matched than the portal reads at once, so the oldest aren’t shown.
              Check Outlook for any still waiting.
            </p>
          )}
          <ApprovalsList items={view.items} agents={agents} />
        </div>
      );
  }
}

function MailboxTab({
  view,
  folder,
}: {
  view: EmailsOverview['mailboxes'][number];
  folder: string;
}) {
  switch (view.status) {
    case 'no-consent':
      return (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title={`The portal can’t read ${view.mailbox} yet`}
          body={`An administrator needs to grant the portal the Mail.Read.Shared permission (delegated, admin consent). ${CONSENT_DOC}`}
        />
      );
    case 'no-access':
      return (
        <EmptyState
          icon={<UserLock className="h-6 w-6" />}
          title={`You don’t have access to ${view.mailbox}`}
          body="Exchange decides who can open this mailbox. Ask your Microsoft 365 administrator for access if you need it."
        />
      );
    case 'error':
      return <ErrorPanel title={`Couldn’t read ${view.mailbox}`} message={view.error} />;
    case 'ok': {
      const shown = view.folders.find((f) => f.key === folder);
      return shown ? <MailboxList folder={shown} mailbox={view.mailbox} /> : null;
    }
  }
}

export async function EmailsView({ basePath, status }: { basePath: string; status?: string }) {
  const auth = await requireAuth(basePath);
  if (!canManageSettings(auth.user))
    return (
      <EmptyState
        title="Only people in the organisation see agent emails"
        body="You’re signed in as a guest."
      />
    );
  const overview = await getEmailsOverview(auth);
  const pending =
    overview.approvals.status === 'ok'
      ? overview.approvals.items.filter((i) => i.status === 'pending').length
      : undefined;
  const showApprovals = overview.approvals.status === 'ok' && overview.approvals.isApprover;
  const capture = overview.mailboxes.find((mailbox) => mailbox.capture);
  const entries = [
    ...overview.mailboxes.map((mailbox, index) => ({
      value: `mb-${index}`,
      mailbox,
      folder: 'inbox',
      label: mailbox.label
        ? `${mailbox.label} (${inboxLabel(mailbox.mailbox)})`
        : inboxLabel(mailbox.mailbox),
    })),
    ...(capture
      ? [
          {
            value: 'needs-review',
            mailbox: capture,
            folder: 'needs-review',
            label: 'Needs review',
          },
          { value: 'captured', mailbox: capture, folder: 'captured', label: 'Captured' },
        ]
      : []),
  ];
  const selected = entries.find((entry) => entry.value === status);
  const tab = selected?.value ?? (showApprovals ? 'approvals' : entries[0]?.value);
  const active = entries.find((entry) => entry.value === tab);
  const setup =
    overview.approvals.status === 'not-configured' || overview.approvals.status === 'no-consent';
  if (
    !overview.agents.length &&
    overview.mailboxes.length === 0 &&
    overview.approvals.status === 'not-configured'
  )
    return <ApprovalsTab view={overview.approvals} agents={overview.agents} />;
  // Only once approvals loaded and the person isn't an approver: a consent or error state
  // must still show its own explanation.
  if (
    overview.approvals.status === 'ok' &&
    !showApprovals &&
    ((overview.mailboxes.length > 0 &&
      overview.mailboxes.every((mailbox) => mailbox.status === 'no-access')) ||
      (overview.mailboxes.length === 0 && overview.agents.length))
  )
    return (
      <EmptyState
        title="Nothing here for you"
        body={`${overview.agents.length === 1 ? overview.agents[0].displayName + '’s held emails' : 'Held emails'} go to the approvers set in Exchange, and shared mailboxes are open to the people Exchange allows.`}
      />
    );

  return (
    <>
      <div className="mx-auto max-w-4xl" data-testid="emails-page">
        <PageHeader
          title="Email"
          crumbs={[{ label: 'My organisations', href: '/portal' }]}
          meta={`${overview.agents.length === 1 ? overview.agents[0].displayName + '’s' : 'Agents’'} emails waiting for your approval, and shared mailboxes. Read live from Microsoft 365; the portal keeps no copies.`}
        />
        <StatusTabs
          basePath={basePath}
          current={tab === 'approvals' ? 'all' : (tab ?? 'all')}
          tabs={[
            ...(showApprovals ? [{ value: 'all', label: 'Approvals', count: pending }] : []),
            ...entries.map((entry) => {
              const folder =
                entry.mailbox.status === 'ok'
                  ? entry.mailbox.folders.find((f) => f.key === entry.folder)
                  : undefined;
              return {
                value: entry.value,
                label: entry.label,
                count:
                  folder && !folder.missing && !folder.noAccess && !folder.more
                    ? folder.messages.length
                    : undefined,
              };
            }),
          ]}
        />
        {overview.demo && (
          <p className="text-muted mb-4 flex items-center gap-1.5 text-xs">
            <MailQuestion className="h-3.5 w-3.5" /> Sample emails for the demo organisation.
          </p>
        )}
        {(setup || overview.approvals.status === 'error') && (
          <ApprovalsTab view={overview.approvals} agents={overview.agents} />
        )}
        {tab === 'approvals' ? (
          <ApprovalsTab view={overview.approvals} agents={overview.agents} />
        ) : active ? (
          <MailboxTab view={active.mailbox} folder={active.folder} />
        ) : null}
      </div>
    </>
  );
}
