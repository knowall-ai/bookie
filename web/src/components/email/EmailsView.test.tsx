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
    approvals: { status: 'ok', isApprover: false, items: [] },
    mailbox: {
      status: 'ok',
      mailbox: 'accounts@example.com',
      folders: [{ key: 'inbox', label: 'Accounts inbox', path: '', messages: [] }],
    },
  });
  const html = renderToStaticMarkup(
    await EmailsView({ basePath: '/portal/demo.contoso/email', status: 'approvals' })
  );
  expect(html).not.toContain('Held requests');
  expect(html).not.toContain('>Approvals');
  expect(html).toContain('Inbox messages');
  expect(html).toContain('/portal/demo.contoso/email?status=inbox');
});

it('shows one empty state when neither mailbox is available to the person', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    approvals: { status: 'ok', isApprover: false, items: [] },
    mailbox: { status: 'no-access', mailbox: 'accounts@example.com' },
  });
  const html = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(html).toContain('Nothing here for you');
  expect(html).not.toContain('role="tab"');
});

it('keeps setup explanations visible without an Approvals tab', async () => {
  vi.mocked(getEmailsOverview).mockResolvedValue({
    approvals: { status: 'no-consent' },
    mailbox: { status: 'not-configured' },
  });
  const html = renderToStaticMarkup(await EmailsView({ basePath: '/portal/emails' }));
  expect(html).toContain('Mail.ReadWrite');
  expect(html).not.toContain('>Approvals');
});
