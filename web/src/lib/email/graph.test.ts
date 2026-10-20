// Copied from knowall-ai/agents-portal src/lib/providers/approvals.test.ts @ d0f5af6; keep in step.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MARKER_RETRY,
  decideApproval,
  getApprovalDetail,
  listApprovals,
  resolveSenders,
} from './graph';

const SENDER = 'agent@example.com';
const SENDERS = [SENDER, 'agent.upn@example.onmicrosoft.com'];
const NOW = new Date('2026-10-19T15:00:00Z');
const ARBITRATION = 'SystemMailbox{1A2B3C4D-0000-4000-8000-00000000ABCD}@example.onmicrosoft.com';

const REQUEST = {
  id: 'req-1',
  subject: 'Approval requested:Quote for Acme',
  receivedDateTime: '2026-10-19T14:00:00Z',
  parentFolderId: 'inbox-id',
  from: { emailAddress: { address: 'Agent@Example.com' } },
  replyTo: [{ emailAddress: { name: 'Microsoft Exchange', address: ARBITRATION } }],
  body: {
    contentType: 'text',
    content:
      'has asked you to approve the attached message for delivery to:\r\n\r\nSam Ortiz\r\n________________________________\r\nA preview of the message is below. To view the complete message, open the attachment.\r\nHi Sam',
  },
  singleValueExtendedProperties: [
    { id: 'String 0x1a', value: 'IPM.Note.Microsoft.Approval.Request' },
    { id: 'Binary 0x31', value: 'dGFn' },
  ],
};

type Handler = (url: URL, init: RequestInit) => Response | undefined;

let calls: { method: string; url: URL; body?: unknown }[] = [];

function stubGraph(handler: Handler) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      calls.push({
        method: init.method ?? 'GET',
        url,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.pathname.endsWith('/me/mailFolders/inbox')) return Response.json({ id: 'inbox-id' });
      return handler(url, init) ?? new Response('{}', { status: 500 });
    })
  );
}

const path = (url: URL) => decodeURIComponent(url.pathname.replace('/v1.0', ''));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  MARKER_RETRY.ms = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listApprovals', () => {
  it('asks /me for this sender’s requests as text and maps them', async () => {
    stubGraph((url) =>
      path(url) === '/me/messages' ? Response.json({ value: [REQUEST] }) : undefined
    );
    const { items, incomplete } = await listApprovals('token', SENDERS, NOW);
    expect(incomplete).toBe(false);
    expect(items).toEqual([
      expect.objectContaining({
        id: 'req-1',
        subject: 'Quote for Acme',
        status: 'pending',
        recipients: ['Sam Ortiz'],
        preview: 'Hi Sam',
      }),
    ]);
    const list = calls.find((c) => path(c.url) === '/me/messages');
    expect(list?.url.searchParams.get('$filter')).toContain(`'${SENDER}'`);
    const init = vi
      .mocked(fetch)
      .mock.calls.find(([u]) => String(u).includes('/me/messages?'))?.[1];
    expect((init?.headers as Record<string, string>).Prefer).toContain('text');
  });

  it('follows every page, so a pending request on a later page is listed', async () => {
    const page2 = 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=2';
    stubGraph((url) => {
      if (url.href === page2) {
        return Response.json({
          value: [{ ...REQUEST, id: 'req-2', receivedDateTime: '2026-10-19T09:00:00Z' }],
        });
      }
      if (path(url) === '/me/messages') {
        return Response.json({
          value: [
            { ...REQUEST, singleValueExtendedProperties: [{ id: 'Integer 0x1081', value: '1' }] },
          ],
          '@odata.nextLink': page2,
        });
      }
    });
    const { items, incomplete } = await listApprovals('token', SENDERS, NOW);
    expect(items.map((i) => [i.id, i.status])).toEqual([
      ['req-2', 'pending'],
      ['req-1', 'approved'],
    ]);
    expect(incomplete).toBe(false);
  });

  it('says the list is incomplete rather than paging forever', async () => {
    stubGraph((url) =>
      path(url) === '/me/messages'
        ? Response.json({
            value: [REQUEST],
            '@odata.nextLink': `${url.origin}/v1.0/me/messages?$skiptoken=n`,
          })
        : undefined
    );
    const { incomplete } = await listApprovals('token', SENDERS, NOW);
    expect(incomplete).toBe(true);
    expect(calls.filter((c) => path(c.url) === '/me/messages').length).toBe(10);
  });

  it('still lists when the inbox lookup fails, without the folder hint', async () => {
    stubGraph((url) =>
      path(url) === '/me/messages' ? Response.json({ value: [REQUEST] }) : undefined
    );
    vi.mocked(fetch).mockImplementationOnce(async () => new Response('{}', { status: 500 }));
    const { items } = await listApprovals('token', SENDERS, NOW);
    expect(items[0].status).toBe('pending');
  });

  it('fails with a label only, never the address', async () => {
    stubGraph(() => new Response('{}', { status: 403 }));
    await expect(listApprovals('token', SENDERS, NOW)).rejects.toThrow('Graph 403 approval list');
    await expect(listApprovals('token', SENDERS, NOW)).rejects.not.toThrow(/example\.com/);
  });
});

describe('getApprovalDetail', () => {
  const held = {
    '@odata.type': '#microsoft.graph.itemAttachment',
    item: {
      subject: 'Quote for Acme',
      from: { emailAddress: { name: 'Agent', address: SENDER } },
      toRecipients: [{ emailAddress: { name: 'Sam Ortiz', address: 'sam@example.org' } }],
      body: { contentType: 'html', content: '<p>Hi Sam</p>' },
      hasAttachments: true,
    },
  };

  it('reads the held email from the request’s attachment', async () => {
    stubGraph((url) => {
      if (path(url) === '/me/messages/req-1') return Response.json(REQUEST);
      if (path(url) === '/me/messages/req-1/attachments') return Response.json({ value: [held] });
    });
    const detail = await getApprovalDetail('token', 'req-1', SENDERS, NOW);
    expect(detail).toMatchObject({
      subject: 'Quote for Acme',
      from: { name: 'Agent', address: SENDER },
      to: [{ name: 'Sam Ortiz', address: 'sam@example.org' }],
      cc: [],
      bodyType: 'html',
      body: '<p>Hi Sam</p>',
      hasAttachments: true,
      status: 'pending',
    });
  });

  it('falls back to the preview when there is no attachment', async () => {
    stubGraph((url) => {
      if (path(url) === '/me/messages/req-1') return Response.json(REQUEST);
      if (path(url) === '/me/messages/req-1/attachments') return Response.json({ value: [] });
    });
    const detail = await getApprovalDetail('token', 'req-1', SENDERS, NOW);
    expect(detail).toMatchObject({
      bodyType: 'text',
      body: 'Hi Sam',
      to: [],
      hasAttachments: false,
    });
  });

  it('accepts a request from any of the agent addresses', async () => {
    stubGraph((url) => {
      if (path(url) === '/me/messages/req-1') {
        return Response.json({
          ...REQUEST,
          from: { emailAddress: { address: 'Agent.UPN@example.onmicrosoft.com' } },
        });
      }
      if (path(url) === '/me/messages/req-1/attachments') return Response.json({ value: [] });
    });
    expect(await getApprovalDetail('token', 'req-1', SENDERS, NOW)).not.toBeNull();
  });

  it('refuses a message from someone else, or that is not a moderation request', async () => {
    stubGraph((url) =>
      path(url) === '/me/messages/req-1'
        ? Response.json({ ...REQUEST, from: { emailAddress: { address: 'other@example.com' } } })
        : undefined
    );
    expect(await getApprovalDetail('token', 'req-1', SENDERS, NOW)).toBeNull();
    stubGraph((url) =>
      path(url) === '/me/messages/req-1'
        ? Response.json({ ...REQUEST, singleValueExtendedProperties: [] })
        : undefined
    );
    expect(await getApprovalDetail('token', 'req-1', SENDERS, NOW)).toBeNull();
  });

  it('treats an id Graph cannot find as not found, and other failures as errors', async () => {
    stubGraph(() => new Response('{}', { status: 404 }));
    expect(await getApprovalDetail('token', 'nope', SENDERS, NOW)).toBeNull();
    stubGraph(() => new Response('{}', { status: 400 }));
    expect(await getApprovalDetail('token', 'bad id', SENDERS, NOW)).toBeNull();
    stubGraph(() => new Response('{}', { status: 503 }));
    await expect(getApprovalDetail('token', 'req-1', SENDERS, NOW)).rejects.toThrow(
      'Graph 503 approval lookup'
    );
  });
});

describe('decideApproval', () => {
  function happy(overrides: Partial<Record<string, Response>> = {}) {
    stubGraph((url, init) => {
      const p = path(url);
      const method = init.method ?? 'GET';
      if (p === '/me/messages/req-1' && method === 'GET') return Response.json(REQUEST);
      if (p === '/me/messages/req-1/createReply')
        return overrides.createReply ?? Response.json({ id: 'draft-1' });
      if (p === '/me/messages/draft-1/send')
        return overrides.send ?? new Response(null, { status: 202 });
      if (p === '/me/messages/draft-1' && method === 'DELETE')
        return new Response(null, { status: 204 });
      if (p === '/me/messages/req-1' && method === 'PATCH')
        return overrides.patch ?? Response.json({});
    });
  }

  it('replies with the vote and report tag, sends it, then marks the request', async () => {
    happy();
    const result = await decideApproval('token', 'req-1', SENDERS, 'reject', 'Shorter', NOW);
    expect(result).toEqual({ ok: true, status: 'rejected' });
    const reply = calls.find((c) => path(c.url).endsWith('/createReply'));
    expect(reply?.body).toEqual({
      message: {
        subject: 'Reject: Quote for Acme',
        body: { contentType: 'text', content: 'Shorter' },
        toRecipients: [{ emailAddress: { name: 'Microsoft Exchange', address: ARBITRATION } }],
        singleValueExtendedProperties: [
          { id: 'String 0x001A', value: 'IPM.Note.Microsoft.Approval.Reply.Reject' },
          { id: 'String {00062008-0000-0000-C000-000000000046} Id 0x8524', value: 'Reject' },
          { id: 'Binary 0x0031', value: 'dGFn' },
        ],
      },
    });
    expect(calls.map((c) => `${c.method} ${path(c.url)}`)).toEqual(
      expect.arrayContaining(['POST /me/messages/draft-1/send', 'PATCH /me/messages/req-1'])
    );
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toMatchObject({ isRead: true });
  });

  it('retries only the marker, never the vote', async () => {
    let patches = 0;
    happy();
    const graphFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (init?.method === 'PATCH' && ++patches < 3) return new Response('{}', { status: 503 });
      return graphFetch(input as string, init);
    });
    expect(await decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)).toEqual({
      ok: true,
      status: 'approved',
    });
    expect(patches).toBe(3);
    expect(vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith('/send')).length).toBe(1);
  });

  it('still reports success when every marker attempt fails, and the request is then not pending', async () => {
    happy({ patch: new Response('{}', { status: 500 }) });
    expect(await decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)).toEqual({
      ok: true,
      status: 'approved',
    });
    expect(calls.filter((c) => c.method === 'PATCH').length).toBe(3);
    // Exchange stamped the request as replied (last verb 102) when the vote was sent
    stubGraph((url) =>
      path(url) === '/me/messages/req-1'
        ? Response.json({
            ...REQUEST,
            singleValueExtendedProperties: [
              ...REQUEST.singleValueExtendedProperties,
              { id: 'Integer 0x1081', value: '102' },
            ],
          })
        : undefined
    );
    expect(await decideApproval('token', 'req-1', SENDERS, 'reject', 'No', NOW)).toEqual({
      ok: false,
      reason: 'not-pending',
    });
    expect(calls.some((c) => path(c.url).endsWith('/createReply'))).toBe(false);
  });

  it('deletes the draft when sending fails, and rethrows', async () => {
    happy({ send: new Response('{}', { status: 500 }) });
    await expect(
      decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)
    ).rejects.toThrow('Graph 500 decision send');
    expect(calls.some((c) => c.method === 'DELETE' && path(c.url) === '/me/messages/draft-1')).toBe(
      true
    );
  });

  it('sends no vote when the inbox cannot be verified', async () => {
    happy();
    const graphFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) =>
      String(input).includes('/me/mailFolders/inbox')
        ? new Response('{}', { status: 503 })
        : graphFetch(input as string, init)
    );
    await expect(
      decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)
    ).rejects.toThrow('Graph 503 inbox lookup');
    expect(calls.some((c) => path(c.url).endsWith('/createReply'))).toBe(false);
  });

  it('sends one vote when opposite decisions race on the same request', async () => {
    let marked: string | undefined;
    stubGraph((url, init) => {
      const p = path(url);
      const method = init.method ?? 'GET';
      if (p === '/me/messages/req-1' && method === 'GET') {
        // once marked, the request reads as decided
        const props = marked
          ? [
              ...REQUEST.singleValueExtendedProperties,
              { id: 'String {00062008-0000-0000-C000-000000000046} Id 0x8524', value: marked },
            ]
          : REQUEST.singleValueExtendedProperties;
        return Response.json({ ...REQUEST, singleValueExtendedProperties: props });
      }
      if (p === '/me/messages/req-1/createReply') return Response.json({ id: 'draft-1' });
      if (p === '/me/messages/draft-1/send') return new Response(null, { status: 202 });
      if (p === '/me/messages/req-1' && method === 'PATCH') {
        marked = JSON.parse(String(init.body)).singleValueExtendedProperties[0].value;
        return Response.json({});
      }
    });
    const results = await Promise.all([
      decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW),
      decideApproval('token', 'req-1', SENDERS, 'reject', 'No', NOW),
    ]);
    expect(results).toEqual([
      { ok: true, status: 'approved' },
      { ok: false, reason: 'not-pending' },
    ]);
    expect(calls.filter((c) => path(c.url).endsWith('/send')).length).toBe(1);
    expect(marked).toBe('Approve');
  });

  it('answers only a pending request it can address', async () => {
    stubGraph(() => new Response('{}', { status: 404 }));
    expect(await decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)).toEqual({
      ok: false,
      reason: 'not-found',
    });

    stubGraph((url) =>
      path(url) === '/me/messages/req-1'
        ? Response.json({
            ...REQUEST,
            singleValueExtendedProperties: [
              ...REQUEST.singleValueExtendedProperties,
              { id: 'Integer 0x1081', value: '1' },
            ],
          })
        : undefined
    );
    expect(await decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)).toEqual({
      ok: false,
      reason: 'not-pending',
    });

    stubGraph((url) =>
      path(url) === '/me/messages/req-1' ? Response.json({ ...REQUEST, replyTo: [] }) : undefined
    );
    expect(await decideApproval('token', 'req-1', SENDERS, 'approve', undefined, NOW)).toEqual({
      ok: false,
      reason: 'unanswerable',
    });
    expect(calls.some((c) => path(c.url).endsWith('/createReply'))).toBe(false);
  });
});

describe('resolveSenders', () => {
  it('reads the primary address and aliases, keeping the UPN', async () => {
    stubGraph((url) =>
      path(url).startsWith('/users/')
        ? Response.json({
            mail: 'Agent@Example.com',
            proxyAddresses: ['smtp:old@example.com', 'SMTP:agent@example.com', 'X500:/o=x'],
          })
        : undefined
    );
    expect(await resolveSenders('dir-token', 'upn@example.onmicrosoft.com')).toEqual([
      'agent@example.com',
      'old@example.com',
      'upn@example.onmicrosoft.com',
    ]);
  });

  it('falls back to the UPN without a token or when the lookup fails', async () => {
    expect(await resolveSenders(null, 'UPN@example.com')).toEqual(['upn@example.com']);
    stubGraph(() => new Response('{}', { status: 403 }));
    expect(await resolveSenders('dir-token', 'upn@example.com')).toEqual(['upn@example.com']);
  });
});
