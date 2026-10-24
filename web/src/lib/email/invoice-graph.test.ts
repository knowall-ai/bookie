import { afterEach, describe, expect, it, vi } from 'vitest';
import { GraphMailbox } from './graph';

const mailbox = new GraphMailbox('accounts@contoso.example', async () => 'opaque');
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
