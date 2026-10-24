import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphMailbox } from './graph';

let mailbox: GraphMailbox;
beforeEach(() => {
  mailbox = new GraphMailbox('accounts@contoso.example', async () => 'opaque');
});
function graph(parentFolderId: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const path = String(url);
    if (path.includes('/mailFolders/inbox?$select')) return Response.json({ id: 'inbox-id' });
    if (path.includes('/childFolders')) {
      const filter = new URL(path).searchParams.get('$filter') ?? '';
      return Response.json({
        value: [
          {
            id: filter.includes('Needs review')
              ? 'review-id'
              : filter.includes('Processed')
                ? 'processed-id'
                : 'bookie-id',
          },
        ],
      });
    }
    if (path.endsWith('/$value')) return new Response('%PDF-1.4');
    if (path.includes('/attachments?'))
      return Response.json({
        value: [{ id: 'att', name: 'invoice.pdf', contentType: 'application/pdf' }],
      });
    return Response.json({ id: 'message', parentFolderId, internetMessageHeaders: [] });
  });
}
afterEach(() => vi.restoreAllMocks());
describe('invoice mailbox folder boundary', () => {
  it.each(['inbox-id', 'review-id', 'processed-id'])(
    'allows %s and downloads its attachment',
    async (folder) => {
      graph(folder);
      expect((await mailbox.message('message')).attachments).toHaveLength(1);
      expect((await mailbox.attachment('message', 'att')).bytes.byteLength).toBeGreaterThan(0);
    }
  );
  it.each(['deleted-id', 'junk-id', 'sent-id', '', 'bookie-id'])(
    'refuses %s before reading attachments',
    async (folder) => {
      const fetch = graph(folder);
      await expect(mailbox.message('message')).rejects.toThrow('not in the accounts inbox');
      await expect(mailbox.attachment('message', 'att')).rejects.toMatchObject({ status: 403 });
      expect(fetch.mock.calls.some(([url]) => String(url).includes('/attachments'))).toBe(false);
    }
  );
  it.each([403, 404])('preserves Graph %s', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ error: { code: 'ErrorAccessDenied' } }, { status })
    );
    await expect(mailbox.message('missing')).rejects.toMatchObject({ status });
  });
});

it('resolves folders once per instance and reuses messages for downloads', async () => {
  const fetch = graph('inbox-id');
  await Promise.all([mailbox.message('message'), mailbox.message('message')]);
  const folderCalls = () =>
    fetch.mock.calls.filter(([url]) => String(url).includes('/mailFolders/')).length;
  const initial = folderCalls();
  await mailbox.attachment('message', 'att');
  await mailbox.message('second');
  expect(folderCalls()).toBe(initial);
  expect(
    fetch.mock.calls.filter(([url]) => String(url).includes('/messages/message?'))
  ).toHaveLength(1);
  const other = new GraphMailbox('accounts@contoso.example', async () => 'opaque');
  await other.message('message');
  expect(folderCalls()).toBe(initial * 2);
});
it.each([
  'https://graph.microsoft.com/v1.0/users/mailbox-id/messages/message/attachments?$skiptoken=next',
  'https://graph.microsoft.com/v1.0/users/accounts@contoso.example/messages/message/attachments?$skiptoken=next',
  "https://graph.microsoft.com/v1.0/users('accounts%40contoso.example')/messages('message')/attachments?$skiptoken=next",
])('accepts equivalent Graph attachment pagination: %s', async (nextLink) => {
  const fetch = graph('inbox-id');
  const base = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (url, init) => {
    if (String(url) === nextLink)
      return Response.json({ value: [{ id: 'second-att', name: 'second.pdf' }] });
    if (String(url).includes('/attachments?'))
      return Response.json({
        value: [{ id: 'att', name: 'invoice.pdf' }],
        '@odata.nextLink': nextLink,
      });
    return base(url, init);
  });
  expect((await mailbox.message('message')).attachments.map((a) => a.id)).toEqual([
    'att',
    'second-att',
  ]);
});
it.each([
  'https://example.com/v1.0/users/accounts@contoso.example/messages/message/attachments',
  'https://graph.microsoft.com/v1.0/users/accounts@contoso.example/messages/other/attachments',
])('refuses unrelated attachment pages: %s', async (nextLink) => {
  const fetch = graph('inbox-id');
  const base = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (url, init) =>
    String(url).includes('/attachments?')
      ? Response.json({ value: [], '@odata.nextLink': nextLink })
      : base(url, init)
  );
  await expect(mailbox.message('message')).rejects.toThrow('Invalid attachment page');
  expect(fetch.mock.calls.some(([url]) => String(url) === nextLink)).toBe(false);
});
