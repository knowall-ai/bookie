import { describe, expect, it, vi } from 'vitest';
import { GraphMailbox, isMailboxError } from './graph';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('GraphMailbox', () => {
  it("lists the mailbox's messages with attachments, as the user, following pages", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        ok({
          value: [
            {
              id: 'm1',
              attachments: [{ id: 'a1', name: 'x.pdf', contentType: 'application/pdf' }],
            },
          ],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next',
        })
      )
      .mockResolvedValueOnce(ok({ value: [{ id: 'm2' }] }));
    const box = new GraphMailbox('accounts@contoso.example', async () => 'token-1', fetcher);
    const messages = await box.list('2026-10-01T00:00:00.000Z', 40);
    expect(messages.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(messages[1].attachments).toEqual([]);
    const [url, init] = fetcher.mock.calls[0];
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe('/v1.0/users/accounts%40contoso.example/messages');
    expect(parsed.searchParams.get('$filter')).toBe(
      'receivedDateTime ge 2026-10-01T00:00:00.000Z and hasAttachments eq true'
    );
    expect(parsed.searchParams.get('$select')).toContain('internetMessageHeaders');
    expect(parsed.searchParams.get('$expand')).toMatch(/^attachments\(/);
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('says plainly when the user cannot open the mailbox', async () => {
    const box = new GraphMailbox(
      'accounts@contoso.example',
      async () => 't',
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { code: 'ErrorAccessDenied' } }), { status: 403 })
      )
    );
    const error = await box.list('2026-10-01T00:00:00Z', 10).catch((e: unknown) => e);
    expect(isMailboxError(error) && error.kind).toBe('forbidden');
    expect((error as Error).message).toMatch(/don't have access to accounts@contoso.example/);
  });

  it('says plainly when the mailbox does not exist', async () => {
    const box = new GraphMailbox(
      'nobody@contoso.example',
      async () => 't',
      vi.fn<typeof fetch>(
        async () =>
          new Response(JSON.stringify({ error: { code: 'ErrorInvalidUser' } }), { status: 404 })
      )
    );
    const error = await box.message('m1').catch((e: unknown) => e);
    expect(isMailboxError(error) && error.kind).toBe('not-found');
  });
});
