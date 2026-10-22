import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApprovalsList } from './ApprovalsList';
import { demoApprovals } from '@/lib/email/demo';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/portal/actions/email', () => ({
  decideEmailApprovalAction: vi.fn(),
  emailApprovalDetailAction: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

it.each([1, 2])('identifies approval rows when there are %s agents', (count) => {
  const agents = [
    { id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' },
    { id: 'sam', displayName: 'Sam', mailbox: 'sam@example.com' },
  ].slice(0, count);
  const items = demoApprovals().map((item, index) => ({
    ...item,
    agentId: agents[index % count].id,
  }));
  const html = renderToStaticMarkup(<ApprovalsList items={items} agents={agents} />);
  if (count === 1) expect(html).not.toContain('From Ava');
  else {
    expect(html).toContain('From Ava');
    expect(html).toContain('From Sam');
  }
  for (const label of [
    'Awaiting approval',
    'Approved',
    'Rejected',
    'Recent (2), the last two weeks',
  ])
    expect(html).toContain(label);
});

it('uses the configured agent name in the empty approval list', () => {
  const html = renderToStaticMarkup(
    <ApprovalsList
      items={[]}
      agents={[{ id: 'ava', displayName: 'Ava', mailbox: 'ava@example.com' }]}
    />
  );
  expect(html).toContain('Ava sends');
  expect(html).not.toContain('Bookie');
});

it('summarises many recipients and lets long addresses wrap', () => {
  const token = `reply+${'x'.repeat(120)}@support.example.com`;
  const [first, ...rest] = demoApprovals();
  const item = { ...first, recipients: ['Sam Ortiz', token, 'Priya Nair', 'Jordan Lee'] };
  const html = renderToStaticMarkup(
    <ApprovalsList
      items={[item, ...rest]}
      agents={[{ id: 'bookie', displayName: 'Bookie', mailbox: 'bookie@example.com' }]}
    />
  );
  expect(html).toContain('+ 2 more');
  expect(html).not.toContain('Priya Nair, Jordan Lee');
  expect(html).toContain('line-clamp-2');
});
