import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMailbox } from './graph';

const MAILBOX = 'accounts@example.com';

function stub(handler: (url: URL) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => handler(new URL(String(input))))
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const message = (id: string) => ({
  id,
  subject: `Invoice ${id}`,
  from: { emailAddress: { name: 'Northwind', address: 'billing@example.org' } },
  receivedDateTime: '2026-10-20T09:00:00Z',
  bodyPreview: 'attached',
  hasAttachments: true,
  isRead: false,
  webLink: 'https://outlook.office365.com/owa/?ItemID=x',
});

afterEach(() => vi.unstubAllGlobals());

describe('readMailbox', () => {
  it('reads the Inbox and walks bill capture folders by name; a missing one is marked', async () => {
    stub((url) => {
      const path = decodeURIComponent(url.pathname);
      if (path.endsWith('/mailFolders/inbox/childFolders'))
        return json({ value: [{ id: 'bookie' }] });
      if (path.endsWith('/mailFolders/bookie/childFolders')) {
        const filter = url.searchParams.get('$filter') ?? '';
        return json({ value: filter.includes('Processed') ? [{ id: 'processed' }] : [] });
      }
      if (path.endsWith('/mailFolders/inbox/messages'))
        return json({
          value: [message('a')],
          '@odata.nextLink': 'https://graph.microsoft.com/next',
        });
      if (path.endsWith('/mailFolders/processed/messages')) return json({ value: [message('b')] });
      return json({ error: { code: 'NotFound' } }, 404);
    });
    const read = await readMailbox('token', MAILBOX);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    const [inbox, review, captured] = read.folders;
    expect(inbox).toMatchObject({ key: 'inbox', more: true, messages: [{ id: 'a' }] });
    expect(review).toMatchObject({ key: 'needs-review', missing: true, messages: [] });
    expect(captured).toMatchObject({ key: 'captured', messages: [{ id: 'b' }] });
  });

  it('says no access when Exchange refuses, or the address is not a mailbox', async () => {
    stub(() => json({ error: { code: 'ErrorAccessDenied' } }, 403));
    expect(await readMailbox('token', MAILBOX)).toEqual({ ok: false, reason: 'no-access' });
    stub(() => json({ error: { code: 'ErrorInvalidUser' } }, 400));
    expect(await readMailbox('token', MAILBOX)).toEqual({ ok: false, reason: 'no-access' });
  });

  it('hides only the folder Exchange refuses, keeping the rest', async () => {
    stub((url) => {
      const path = decodeURIComponent(url.pathname);
      if (path.endsWith('/mailFolders/inbox/messages')) return json({ value: [message('a')] });
      return json({ error: { code: 'ErrorAccessDenied' } }, 403);
    });
    const read = await readMailbox('token', MAILBOX);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.folders.map((f) => [f.key, !!f.noAccess, f.messages.length])).toEqual([
      ['inbox', false, 1],
      ['needs-review', true, 0],
      ['captured', true, 0],
    ]);
  });

  it('throws other failures without the mailbox address in the message', async () => {
    stub(() => json({ error: { code: 'ServiceUnavailable' } }, 503));
    const error = await readMailbox('token', MAILBOX).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(MAILBOX);
  });
});
