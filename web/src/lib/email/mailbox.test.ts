import { describe, expect, it } from 'vitest';
import {
  canModerate,
  canReadShared,
  childFolderFilter,
  inboxLabel,
  folderSegments,
  isNoAccess,
  toMailboxMessage,
  tokenScopes,
} from './mailbox';

function jwt(claims: object): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(claims)}.sig`;
}

describe('mailbox helpers', () => {
  it('splits folder paths under the Inbox', () => {
    expect(folderSegments('')).toEqual([]);
    expect(folderSegments('Bookie/Needs review')).toEqual(['Bookie', 'Needs review']);
    expect(folderSegments(' Bookie / Processed /')).toEqual(['Bookie', 'Processed']);
  });

  it('escapes quotes in a folder filter', () => {
    expect(childFolderFilter("Ben's")).toBe("displayName eq 'Ben''s'");
  });

  it('treats 403, 404 and a non-mailbox address as no access, not an error', () => {
    expect(isNoAccess(403)).toBe(true);
    expect(isNoAccess(404)).toBe(true);
    expect(isNoAccess(400, 'ErrorInvalidUser')).toBe(true);
    expect(isNoAccess(400, 'BadRequest')).toBe(false);
    expect(isNoAccess(500)).toBe(false);
  });

  it('maps a Graph message, dropping what it lacks', () => {
    expect(
      toMailboxMessage({
        id: 'm1',
        subject: '  ',
        from: { emailAddress: { name: 'billing@example.com', address: 'billing@example.com' } },
        receivedDateTime: '2026-10-20T09:00:00Z',
        bodyPreview: 'Invoice\r\n  attached',
        hasAttachments: true,
        isRead: false,
        webLink: 'javascript:alert(1)',
      })
    ).toEqual({
      id: 'm1',
      subject: '(no subject)',
      from: { address: 'billing@example.com' },
      receivedAt: '2026-10-20T09:00:00Z',
      preview: 'Invoice attached',
      hasAttachments: true,
      isRead: false,
    });
    expect(toMailboxMessage({ id: 'm2' })).toBeUndefined();
  });

  it('reads delegated scopes from a token, and null for one it cannot read', () => {
    const scopes = tokenScopes(jwt({ scp: 'Mail.ReadWrite Mail.Send Mail.Read.Shared User.Read' }));
    expect(canModerate(scopes)).toBe(true);
    expect(canReadShared(scopes)).toBe(true);
    const basic = tokenScopes(jwt({ scp: 'Mail.ReadWrite Mail.ReadBasic.Shared' }));
    expect(canModerate(basic)).toBe(false);
    expect(canReadShared(basic)).toBe(false);
    // Unreadable (opaque) tokens: don't claim consent is missing, let Graph decide.
    expect(tokenScopes('not-a-token')).toBeNull();
    expect(canModerate(null)).toBe(true);
    expect(canReadShared(null)).toBe(true);
  });
});

describe('inboxLabel', () => {
  it('names the inbox by its address, as Outlook does', () => {
    expect(inboxLabel('accounts@example.com')).toBe('accounts@ inbox');
    expect(inboxLabel(undefined)).toBe('Inbox');
  });
});
