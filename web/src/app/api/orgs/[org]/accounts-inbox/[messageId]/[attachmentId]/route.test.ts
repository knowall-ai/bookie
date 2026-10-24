import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ review: vi.fn(), attachment: vi.fn() }));
vi.mock('@/lib/auth/context', () => ({ getAuthContext: async () => ({ mode: 'demo' }) }));
vi.mock('@/lib/connectors/registry', () => ({ getConnector: async () => ({}) }));
vi.mock('@/lib/accounts-inbox/review', () => ({
  accountsMailbox: async () => ({ ok: true, reader: { attachment: mocks.attachment } }),
  reviewOne: mocks.review,
}));
import { MailboxGraphError } from '@/lib/email/errors';
import { GET } from './route';
const get = () =>
  GET(new Request('http://localhost/api/file'), {
    params: Promise.resolve({ org: 'demo.contoso', messageId: 'message', attachmentId: 'att' }),
  });
beforeEach(() => vi.clearAllMocks());
it.each([403, 404])('preserves %s and never downloads on a mailbox failure', async (status) => {
  mocks.review.mockRejectedValueOnce(
    new MailboxGraphError(status, undefined, 'not in the accounts inbox')
  );
  const response = await get();
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(mocks.attachment).not.toHaveBeenCalled();
});
it('returns 404 for a missing attachment', async () => {
  mocks.review.mockResolvedValueOnce(undefined);
  expect((await get()).status).toBe(404);
  expect(mocks.attachment).not.toHaveBeenCalled();
});
it('returns 403 for suspicious mail and changed bank details', async () => {
  mocks.review.mockResolvedValueOnce({ verdict: { kind: 'suspicious' } });
  expect((await get()).status).toBe(403);
  expect(mocks.attachment).not.toHaveBeenCalled();
});
