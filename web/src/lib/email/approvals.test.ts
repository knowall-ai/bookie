// Copied from knowall-ai/agents-portal src/lib/approvals.test.ts @ d0f5af6; keep in step.
import { describe, expect, it } from 'vitest';
import {
  MAX_REASON_LENGTH,
  REQUEST_LIFETIME_MS,
  approvalStatus,
  arbitrationAddress,
  decisionMarker,
  decisionMessage,
  heldSubject,
  isApprovalRequest,
  parseDecisionRequest,
  parseRequestBody,
  reportTag,
  requestFilter,
  senderAddresses,
  sortApprovals,
  toApproval,
  type GraphApprovalRequest,
} from './approvals';
import type { EmailApproval } from './types';

const NOW = new Date('2026-10-19T15:00:00Z');
const INBOX = 'inbox-id';

function request(overrides: Partial<GraphApprovalRequest> = {}): GraphApprovalRequest {
  return {
    id: 'req-1',
    subject: 'Approval requested:Quote for Acme',
    receivedDateTime: '2026-10-19T14:00:00Z',
    parentFolderId: INBOX,
    ...overrides,
  };
}

// The text body Exchange writes into a moderation request (English tenant)
const BODY = [
  'Your decision is requested.',
  '',
  'Demo agent has asked you to approve the attached message for delivery to:',
  '',
  'Sam Ortiz; Priya Nair',
  '',
  '',
  '________________________________',
  '',
  'A preview of the message is below. To view the complete message, open the attachment.',
  'Hi Sam,',
  '',
  'Here is the quote we discussed.',
].join('\r\n');

describe('requestFilter', () => {
  it('matches moderation requests from one sender since a date, quoting the address', () => {
    const filter = requestFilter(
      ["o'neil@example.com", 'upn@example.com'],
      new Date('2026-10-05T00:00:00Z')
    );
    expect(filter).toContain("ep/value eq 'IPM.Note.Microsoft.Approval.Request'");
    expect(filter).toContain(
      "(from/emailAddress/address eq 'o''neil@example.com' or from/emailAddress/address eq 'upn@example.com')"
    );
    expect(filter).toContain('receivedDateTime ge 2026-10-05T00:00:00.000Z');
  });
});

describe('approvalStatus', () => {
  it('is pending while undecided, in the inbox and under two days old', () => {
    expect(approvalStatus(request(), INBOX, NOW)).toBe('pending');
  });

  it('reads a decision the portal recorded', () => {
    const approved = request({
      singleValueExtendedProperties: [
        { id: 'String {00062008-0000-0000-c000-000000000046} Id 0x8524', value: 'Approve' },
      ],
    });
    expect(approvalStatus(approved, INBOX, NOW)).toBe('approved');
    const rejected = request({
      singleValueExtendedProperties: [
        { id: 'String {00062008-0000-0000-C000-000000000046} Id 0x8524', value: 'Reject' },
      ],
    });
    expect(approvalStatus(rejected, INBOX, NOW)).toBe('rejected');
  });

  it("reads Outlook's voting buttons from the last verb, as Graph spells the id", () => {
    const vote = (value: string) =>
      request({ singleValueExtendedProperties: [{ id: 'Integer 0x1081', value }] });
    expect(approvalStatus(vote('1'), INBOX, NOW)).toBe('approved');
    expect(approvalStatus(vote('2'), INBOX, NOW)).toBe('rejected');
    expect(approvalStatus(vote('102'), INBOX, NOW)).toBe('decided');
    // forwarding (104) or replying all (103) casts no vote
    expect(approvalStatus(vote('104'), INBOX, NOW)).toBe('pending');
    expect(approvalStatus(vote('103'), INBOX, NOW)).toBe('pending');
  });

  it('calls a request moved out of the inbox decided elsewhere', () => {
    expect(approvalStatus(request({ parentFolderId: 'deleted' }), INBOX, NOW)).toBe('decided');
    // without the inbox id the folder says nothing
    expect(approvalStatus(request({ parentFolderId: 'deleted' }), undefined, NOW)).toBe('pending');
  });

  it('expires after two days undecided', () => {
    const old = new Date(NOW.getTime() - REQUEST_LIFETIME_MS).toISOString();
    expect(approvalStatus(request({ receivedDateTime: old }), INBOX, NOW)).toBe('expired');
  });
});

describe('heldSubject', () => {
  it('drops the request prefix', () => {
    expect(heldSubject('Approval requested:RE: Quote')).toBe('RE: Quote');
    expect(heldSubject('Approval requested: Quote')).toBe('Quote');
    expect(heldSubject('Plain')).toBe('Plain');
    expect(heldSubject('Approval requested:')).toBe('(no subject)');
    expect(heldSubject(null)).toBe('(no subject)');
  });
});

describe('parseRequestBody', () => {
  it('reads the recipients and the preview under the rule', () => {
    const parsed = parseRequestBody(BODY);
    expect(parsed.recipients).toEqual(['Sam Ortiz', 'Priya Nair']);
    expect(parsed.preview).toBe('Hi Sam, Here is the quote we discussed.');
  });

  it('gives nothing rather than template text for an unknown layout', () => {
    expect(parseRequestBody('Something else entirely')).toEqual({ recipients: [], preview: '' });
    expect(parseRequestBody(undefined)).toEqual({ recipients: [], preview: '' });
  });

  it('caps the preview', () => {
    const long = `${BODY}\r\n${'word '.repeat(200)}`;
    expect(parseRequestBody(long).preview.length).toBe(300);
  });
});

describe('toApproval', () => {
  it('builds the list entry with the expiry two days after the request', () => {
    const item = toApproval(request({ body: { contentType: 'text', content: BODY } }), INBOX, NOW);
    expect(item).toEqual({
      id: 'req-1',
      subject: 'Quote for Acme',
      requestedAt: '2026-10-19T14:00:00Z',
      expiresAt: '2026-10-21T14:00:00.000Z',
      status: 'pending',
      recipients: ['Sam Ortiz', 'Priya Nair'],
      preview: 'Hi Sam, Here is the quote we discussed.',
    });
  });
});

describe('sortApprovals', () => {
  const item = (id: string, requestedAt: string, status: EmailApproval['status']) =>
    ({ id, requestedAt, status }) as EmailApproval;

  it('puts pending first, oldest first, then the rest newest first', () => {
    const sorted = sortApprovals([
      item('a', '2026-10-19T10:00:00Z', 'approved'),
      item('b', '2026-10-19T12:00:00Z', 'pending'),
      item('c', '2026-10-19T09:00:00Z', 'pending'),
      item('d', '2026-10-19T11:00:00Z', 'expired'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('parseDecisionRequest', () => {
  it('accepts an approval with or without a note', () => {
    expect(parseDecisionRequest({ decision: 'approve' })).toEqual({ decision: 'approve' });
    expect(parseDecisionRequest({ decision: 'approve', reason: '  ok  ' })).toEqual({
      decision: 'approve',
      reason: 'ok',
    });
  });

  it('requires a reason to reject', () => {
    expect(parseDecisionRequest({ decision: 'reject' })).toEqual({
      error: 'A rejection needs a reason',
    });
    expect(parseDecisionRequest({ decision: 'reject', reason: '   ' })).toHaveProperty('error');
    expect(parseDecisionRequest({ decision: 'reject', reason: 'Too long' })).toEqual({
      decision: 'reject',
      reason: 'Too long',
    });
  });

  it('refuses anything else', () => {
    expect(parseDecisionRequest(null)).toHaveProperty('error');
    expect(parseDecisionRequest('approve')).toHaveProperty('error');
    expect(parseDecisionRequest([{ decision: 'approve' }])).toHaveProperty('error');
    expect(parseDecisionRequest({ decision: 'approve', foo: 1 })).toEqual({
      error: 'Unknown field: foo',
    });
    expect(parseDecisionRequest({ decision: 'send' })).toHaveProperty('error');
    expect(parseDecisionRequest({ decision: 'approve', reason: 5 })).toHaveProperty('error');
    expect(
      parseDecisionRequest({ decision: 'reject', reason: 'x'.repeat(MAX_REASON_LENGTH + 1) })
    ).toHaveProperty('error');
  });
});

describe('decisionMessage', () => {
  const arbitration = { name: 'Microsoft Exchange', address: 'SystemMailbox{1}@example.com' };

  it('carries the vote, the verb and the report tag, to the arbitration mailbox', () => {
    expect(decisionMessage('approve', 'Quote', arbitration, 'dGFn')).toEqual({
      subject: 'Approve: Quote',
      body: { contentType: 'text', content: '' },
      toRecipients: [{ emailAddress: arbitration }],
      singleValueExtendedProperties: [
        { id: 'String 0x001A', value: 'IPM.Note.Microsoft.Approval.Reply.Approve' },
        { id: 'String {00062008-0000-0000-C000-000000000046} Id 0x8524', value: 'Approve' },
        { id: 'Binary 0x0031', value: 'dGFn' },
      ],
    });
  });

  it('puts a rejection reason in the body', () => {
    const message = decisionMessage('reject', 'Quote', arbitration, 'dGFn', 'Shorter please');
    expect(message.subject).toBe('Reject: Quote');
    expect(message.body.content).toBe('Shorter please');
    expect(message.singleValueExtendedProperties[0].value).toBe(
      'IPM.Note.Microsoft.Approval.Reply.Reject'
    );
  });

  it('marks the request with the verb', () => {
    expect(decisionMarker('reject').singleValueExtendedProperties[0].value).toBe('Reject');
  });
});

describe('request fields', () => {
  it('finds the arbitration mailbox only among SystemMailbox addresses', () => {
    const address = 'SystemMailbox{1A2B3C4D-0000-4000-8000-00000000ABCD}@example.onmicrosoft.com';
    expect(
      arbitrationAddress(
        request({ replyTo: [{ emailAddress: { name: 'Microsoft Exchange', address } }] })
      )
    ).toEqual({ name: 'Microsoft Exchange', address });
    expect(
      arbitrationAddress(request({ replyTo: [{ emailAddress: { address: 'x@example.com' } }] }))
    ).toBeNull();
    expect(arbitrationAddress(request())).toBeNull();
  });

  it('reads the report tag and the message class', () => {
    const r = request({
      singleValueExtendedProperties: [
        { id: 'Binary 0x31', value: 'dGFn' },
        { id: 'String 0x1a', value: 'IPM.Note.Microsoft.Approval.Request' },
      ],
    });
    expect(reportTag(r)).toBe('dGFn');
    expect(isApprovalRequest(r)).toBe(true);
    expect(isApprovalRequest(request())).toBe(false);
  });
});

describe('senderAddresses', () => {
  it('puts the primary SMTP address first, then aliases, then the UPN, once each', () => {
    expect(
      senderAddresses('Agent@example.onmicrosoft.com', {
        mail: 'agent@example.com',
        proxyAddresses: [
          'smtp:alias@example.com',
          'SMTP:Agent@example.com',
          'SIP:agent@example.com',
        ],
      })
    ).toEqual(['agent@example.com', 'alias@example.com', 'agent@example.onmicrosoft.com']);
    expect(senderAddresses('upn@example.com')).toEqual(['upn@example.com']);
  });
});
