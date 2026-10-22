import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/auth/context';
import { decideEmailApproval, getEmailsOverview, pendingApprovalCount } from './index';
import { decideApproval, isApprover, listApprovals } from './graph';

const settings = vi.hoisted(() => vi.fn());
vi.mock('@/lib/config', () => ({ configStoreFor: () => ({ getSettings: settings }) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('./graph', async (original) => ({
  ...(await original<typeof import('./graph')>()),
  listApprovals: vi.fn(),
  isApprover: vi.fn(),
  decideApproval: vi.fn(async () => ({ ok: true, status: 'approved' })),
  resolveSenders: vi.fn(async () => ['bookie@example.com']),
  readMailbox: vi.fn(async () => ({ ok: false, reason: 'no-access' })),
}));
let sequence = 0;
function auth(): AuthContext {
  return {
    mode: 'entra',
    user: {
      id: `user-${sequence++}`,
      tenantId: 'tenant-a',
      name: 'Demo',
      email: 'demo@example.com',
      userType: 'Member',
    },
    getToken: vi.fn(async () => 'opaque-token'),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  settings.mockResolvedValue({
    email: { agentAddress: 'bookie@example.com', accountsMailbox: 'accounts@example.com' },
  });
  vi.mocked(listApprovals).mockResolvedValue({
    items: [{ status: 'pending' }, { status: 'approved' }] as never,
    incomplete: false,
  });
  vi.mocked(isApprover).mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pendingApprovalCount', () => {
  it('counts pending requests and expires its cache after sixty seconds', async () => {
    vi.useFakeTimers();
    const person = auth();
    expect(await pendingApprovalCount(person)).toBe(1);
    expect(await pendingApprovalCount(person)).toBe(1);
    expect(listApprovals).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    await pendingApprovalCount(person);
    expect(listApprovals).toHaveBeenCalledTimes(2);
  });
  it('re-reads the count after the person decides, not the cached one', async () => {
    const person = auth();
    expect(await pendingApprovalCount(person)).toBe(1);
    vi.mocked(listApprovals).mockResolvedValue({ items: [], incomplete: false });
    await decideEmailApproval(person, 'request-1', 'approve');
    expect(decideApproval).toHaveBeenCalledTimes(1);
    expect(await pendingApprovalCount(person)).toBe(0);
  });
  it('isolates both tenants and people', async () => {
    const person = auth();
    await pendingApprovalCount(person);
    await pendingApprovalCount({ ...person, user: { ...person.user, tenantId: 'tenant-b' } });
    await pendingApprovalCount(auth());
    expect(listApprovals).toHaveBeenCalledTimes(3);
  });
  it('returns zero for guests without reading settings', async () => {
    const person = auth();
    person.user.userType = 'Guest';
    expect(await pendingApprovalCount(person)).toBe(0);
    expect(settings).not.toHaveBeenCalled();
  });
  it('returns zero without configuration or consent', async () => {
    settings.mockResolvedValueOnce({});
    expect(await pendingApprovalCount(auth())).toBe(0);
    const person = auth();
    person.getToken = async () =>
      `h.${Buffer.from(JSON.stringify({ scp: 'User.Read' })).toString('base64url')}.s`;
    expect(await pendingApprovalCount(person)).toBe(0);
    expect(listApprovals).not.toHaveBeenCalled();
  });
  it('logs only the error class on failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(listApprovals).mockRejectedValueOnce(
      new Error('private subject at accounts@example.com')
    );
    expect(await pendingApprovalCount(auth())).toBe(0);
    expect(warn).toHaveBeenCalledWith('Pending email approvals:', 'Error');
  });
  it('returns the demo pending count', async () => {
    expect(await pendingApprovalCount({ ...auth(), mode: 'demo' })).toBe(2);
    expect(listApprovals).not.toHaveBeenCalled();
  });
});

it.each([true, false])('exposes approver history: %s', async (approver) => {
  vi.mocked(isApprover).mockResolvedValue(approver);
  const view = await getEmailsOverview(auth());
  expect(view.approvals).toMatchObject({ status: 'ok', isApprover: approver });
  expect(listApprovals).toHaveBeenCalledTimes(approver ? 1 : 0);
});
