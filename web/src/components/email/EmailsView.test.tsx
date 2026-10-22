import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmailsView } from './EmailsView';
import { getEmailsOverview } from '@/lib/email';

vi.mock('@/lib/auth/context', () => ({
  requireAuth: async () => ({ user: { userType: 'Member' } }),
}));
vi.mock('@/lib/email', () => ({ getEmailsOverview: vi.fn() }));
vi.mock('@/components/email/ApprovalsList', () => ({ ApprovalsList: () => <p>Held requests</p> }));
vi.mock('@/components/email/MailboxList', () => ({ MailboxList: () => <p>Inbox messages</p> }));
beforeEach(() => vi.clearAllMocks());

it('hides Approvals and defaults to the accounts inbox for non-approvers', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents: [{ id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' }],
    approvals: { status: 'ok', isApprover: false, items: [] },
    mailboxes: [
      {
        status: 'ok',
        mailbox: 'accounts@example.com',
        folders: [{ key: 'inbox', label: 'Inbox', path: '', messages: [] }],
      },
    ],
  });
  const html = renderToStaticMarkup(
    await EmailsView({ basePath: '/portal/demo.contoso/email', status: 'approvals' })
  );
  expect(html).not.toContain('Held requests');
  expect(html).not.toContain('>Approvals');
  expect(html).toContain('Inbox messages');
  expect(html).toContain('/portal/demo.contoso/email?status=mb-0');
});

it('shows one empty state when neither mailbox is available to the person', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents: [{ id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' }],
    approvals: { status: 'ok', isApprover: false, items: [] },
    mailboxes: [{ status: 'no-access', mailbox: 'accounts@example.com' }],
  });
  const html = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(html).toContain('Nothing here for you');
  expect(html).not.toContain('role="tab"');
});

it('keeps setup explanations visible without an Approvals tab', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents: [{ id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' }],
    approvals: { status: 'no-consent' },
    mailboxes: [{ status: 'no-consent', mailbox: 'hello@example.com' }],
  });
  const html = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(html).toContain('Mail.ReadWrite');
  expect(html).not.toContain('>Approvals');
});

it('orders both inboxes before capture folders and selects a labelled mailbox', async () => {
  const { demoEmailsOverview } = await import('@/lib/email/demo');
  vi.mocked(getEmailsOverview).mockResolvedValue(demoEmailsOverview());
  const html = renderToStaticMarkup(
    await EmailsView({ basePath: '/portal/emails', status: 'mb-1' })
  );
  expect(html.indexOf('accounts@ inbox')).toBeLessThan(html.indexOf('Enquiries (hello@ inbox)'));
  expect(html.indexOf('Enquiries (hello@ inbox)')).toBeLessThan(html.indexOf('Needs review'));
  expect(html.indexOf('Needs review')).toBeLessThan(html.indexOf('Captured'));
  expect(html).toContain('Inbox messages');
  expect(html).not.toContain('Held requests');
});

it.each(['no-access', 'no-consent', 'error'] as const)(
  'shows %s inside the selected mailbox tab',
  async (status) => {
    vi.mocked(getEmailsOverview).mockResolvedValue({
      agents: [{ id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' }],
      approvals: { status: 'ok', isApprover: false, items: [] },
      mailboxes: [
        { status: 'ok', mailbox: 'accounts@example.com', folders: [] },
        { status, mailbox: 'hello@example.com', label: 'Enquiries', error: 'Try again' },
      ],
    });
    const html = renderToStaticMarkup(
      await EmailsView({ basePath: '/portal/emails', status: 'mb-1' })
    );
    expect(html).toContain('Enquiries (hello@ inbox)');
    expect(html).toContain(
      status === 'no-access'
        ? 'You don’t have access'
        : status === 'no-consent'
          ? 'Mail.Read.Shared'
          : 'Try again'
    );
    expect(html).not.toContain('Nothing here for you');
  }
);

it('links to Settings when no mailboxes are configured', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents: [],
    approvals: { status: 'not-configured' },
    mailboxes: [],
  });
  const html = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(html).toContain('/portal/settings#email');
});

it('shows nothing available to a non-approver with only an agent address', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents: [{ id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' }],
    approvals: { status: 'ok', isApprover: false, items: [] },
    mailboxes: [],
  });
  expect(renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }))).toContain(
    'Nothing here for you'
  );
});

it.each([1, 2])('uses configured names for %s agents', async (count) => {
  const agents = [
    { id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' },
    { id: 'sam', displayName: 'Sam', mailbox: 'sam@example.com' },
  ].slice(0, count);
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents,
    approvals: { status: 'ok', isApprover: true, items: [] },
    mailboxes: [],
  });
  const html = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(html).toContain(
    count === 1
      ? 'Ava’s emails waiting for your approval'
      : 'Agents’ emails waiting for your approval'
  );
  expect(html).not.toContain('Bookie');
  vi.mocked(getEmailsOverview).mockResolvedValue({
    agents,
    approvals: { status: 'ok', isApprover: false, items: [] },
    mailboxes: [],
  });
  const empty = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(empty).toContain(
    count === 1
      ? 'Ava’s held emails go to the approvers set in Exchange'
      : 'Held emails go to the approvers set in Exchange'
  );
});
