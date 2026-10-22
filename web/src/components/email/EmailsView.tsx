import { KeyRound, MailQuestion, Settings2, UserLock } from 'lucide-react';
import { canManageSettings } from '@/lib/auth/access';
import { requireAuth } from '@/lib/auth/context';
import { getEmailsOverview } from '@/lib/email';
import type { EmailsOverview } from '@/lib/email/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { ApprovalsList } from '@/components/email/ApprovalsList';
import { MailboxList } from '@/components/email/MailboxList';

const CONSENT_DOC = 'See docs/DEPLOYMENT.adoc, “Bookie’s emails”.';

function SettingsLink() {
  return (
    <ButtonLink href="/portal/settings#email" variant="secondary">
      Open Settings
    </ButtonLink>
  );
}

function ApprovalsTab({ view }: { view: EmailsOverview['approvals'] }) {
  switch (view.status) {
    case 'not-configured':
      return (
        <EmptyState
          icon={<Settings2 className="h-6 w-6" />}
          title="Bookie’s email address isn’t set"
          body="Add Bookie’s address in Settings so this page can find the emails Exchange holds for your approval."
          action={<SettingsLink />}
        />
      );
    case 'no-consent':
      return (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title="Bookie can’t read approval requests yet"
          body={`An administrator needs to grant Bookie the Mail.ReadWrite and Mail.Send permissions (delegated, admin consent). ${CONSENT_DOC}`}
        />
      );
    case 'error':
      return <ErrorPanel title="Couldn’t load the emails awaiting approval" message={view.error} />;
    case 'ok':
      return (
        <div className="space-y-3">
          {view.incomplete && (
            <p className="text-warn text-sm">
              More held emails matched than Bookie reads at once, so the oldest aren’t shown. Check
              Outlook for any still waiting.
            </p>
          )}
          <ApprovalsList items={view.items} />
        </div>
      );
  }
}

function MailboxTab({ view, folder }: { view: EmailsOverview['mailbox']; folder: string }) {
  switch (view.status) {
    case 'not-configured':
      return (
        <EmptyState
          icon={<Settings2 className="h-6 w-6" />}
          title="No accounts mailbox set"
          body="Add the mailbox bill capture reads (such as accounts@) in Settings to see it here."
          action={<SettingsLink />}
        />
      );
    case 'no-consent':
      return (
        <EmptyState
          icon={<KeyRound className="h-6 w-6" />}
          title={`Bookie can’t read ${view.mailbox} yet`}
          body={`An administrator needs to grant Bookie the Mail.Read.Shared permission (delegated, admin consent). ${CONSENT_DOC}`}
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
        title="Only people in the organisation see Bookie’s emails"
        body="You’re signed in as a guest."
      />
    );
  const overview = await getEmailsOverview(auth);
  const pending =
    overview.approvals.status === 'ok'
      ? overview.approvals.items.filter((i) => i.status === 'pending').length
      : undefined;
  const folders =
    overview.mailbox.status === 'ok'
      ? overview.mailbox.folders
      : [
          { key: 'inbox', label: 'Accounts inbox' },
          { key: 'needs-review', label: 'Needs review' },
          { key: 'captured', label: 'Captured' },
        ];
  const showApprovals = overview.approvals.status === 'ok' && overview.approvals.isApprover;
  const tab = ['inbox', 'needs-review', 'captured'].includes(status ?? '')
    ? status!
    : showApprovals
      ? 'approvals'
      : 'inbox';
  const setup =
    overview.approvals.status === 'not-configured' || overview.approvals.status === 'no-consent';
  if (
    !showApprovals &&
    !setup &&
    overview.approvals.status === 'ok' &&
    overview.mailbox.status === 'no-access'
  )
    return (
      <EmptyState
        title="Nothing here for you"
        body="Bookie’s held emails go to the approvers set in Exchange, and the accounts mailbox is open to the people Exchange allows."
      />
    );

  return (
    <>
      <div className="mx-auto max-w-4xl" data-testid="emails-page">
        <PageHeader
          title="Email"
          crumbs={[{ label: 'My organisations', href: '/portal' }]}
          meta={
            <>
              Bookie’s emails waiting for your approval, and the{' '}
              {overview.mailbox.status !== 'not-configured' ? overview.mailbox.mailbox : 'accounts'}{' '}
              mailbox he reads invoices from. Read live from Microsoft 365; Bookie keeps no copies.
            </>
          }
        />
        <StatusTabs
          basePath={basePath}
          current={tab === 'approvals' ? 'all' : tab}
          tabs={[
            ...(showApprovals ? [{ value: 'all', label: 'Approvals', count: pending }] : []),
            ...folders.map((f) => ({
              value: f.key,
              label: f.label,
              count:
                'messages' in f && !f.missing && !f.noAccess && !f.more
                  ? f.messages.length
                  : undefined,
            })),
          ]}
        />
        {overview.demo && (
          <p className="text-muted mb-4 flex items-center gap-1.5 text-xs">
            <MailQuestion className="h-3.5 w-3.5" /> Sample emails for the demo organisation.
          </p>
        )}
        {(setup || overview.approvals.status === 'error') && (
          <ApprovalsTab view={overview.approvals} />
        )}
        {tab === 'approvals' ? (
          <ApprovalsTab view={overview.approvals} />
        ) : (
          <MailboxTab view={overview.mailbox} folder={tab} />
        )}
      </div>
    </>
  );
}
