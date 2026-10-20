import { KeyRound, MailQuestion, Settings2, UserLock } from 'lucide-react';
import { canManageSettings } from '@/lib/auth/access';
import { requireAuth } from '@/lib/auth/context';
import { listOrgs } from '@/lib/connectors/registry';
import { getEmailsOverview } from '@/lib/email';
import type { EmailsOverview } from '@/lib/email/types';
import { TopBar } from '@/components/portal/TopBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusTabs } from '@/components/ui/StatusTabs';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState, ErrorPanel } from '@/components/ui/States';
import { ApprovalsList } from '@/components/email/ApprovalsList';
import { MailboxList } from '@/components/email/MailboxList';

export const metadata = { title: 'Bookie’s emails' };

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

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const auth = await requireAuth('/portal/emails');
  const [{ status }, { orgs }] = await Promise.all([searchParams, listOrgs(auth)]);
  const devMode = auth.mode === 'entra' ? undefined : auth.mode;

  // Guests (such as an external accountant) aren't moderators and have no mailbox here.
  if (!canManageSettings(auth.user)) {
    return (
      <>
        <TopBar orgs={orgs} user={auth.user} devMode={devMode} />
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <PageHeader
            title="Bookie’s emails"
            crumbs={[{ label: 'My organisations', href: '/portal' }]}
          />
          <EmptyState
            icon={<UserLock className="h-6 w-6" />}
            title="Only people in the organisation see Bookie’s emails"
            body="You’re signed in as a guest."
          />
        </main>
      </>
    );
  }

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
  const tab = ['inbox', 'needs-review', 'captured'].includes(status ?? '') ? status! : 'approvals';

  return (
    <>
      <TopBar orgs={orgs} user={auth.user} devMode={devMode} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6" data-testid="emails-page">
        <PageHeader
          title="Bookie’s emails"
          crumbs={[{ label: 'My organisations', href: '/portal' }]}
          meta={
            <>
              Emails Bookie wants to send outside your organisation, and the{' '}
              {overview.mailbox.status !== 'not-configured' ? overview.mailbox.mailbox : 'accounts'}{' '}
              mailbox he reads invoices from. Read live from Microsoft 365; Bookie keeps no copies.
            </>
          }
        />
        <StatusTabs
          basePath="/portal/emails"
          current={tab === 'approvals' ? 'all' : tab}
          tabs={[
            { value: 'all', label: 'Awaiting approval', count: pending },
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
        {tab === 'approvals' ? (
          <ApprovalsTab view={overview.approvals} />
        ) : (
          <MailboxTab view={overview.mailbox} folder={tab} />
        )}
      </main>
    </>
  );
}
