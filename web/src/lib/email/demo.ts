/**
 * Sample emails for the demo organisation (BOOKIE_DEV_AUTH=demo): fictional
 * held chasers and accounts-inbox mail, relative to now so the pending ones stay
 * pending. Decisions made in the demo are passed in (lib/email keeps them in a
 * browser cookie), so each browser starts fresh and the server keeps nothing.
 * Never reachable in production.
 */
import { REQUEST_LIFETIME_MS, sortApprovals } from './approvals';
import { MAILBOX_FOLDERS } from './mailbox';
import type {
  ApprovalDecision,
  ApprovalStatus,
  EmailApproval,
  EmailApprovalDetail,
  EmailsOverview,
  MailboxFolderKey,
  MailboxMessage,
  SharedMailbox,
} from './types';

const HOUR = 60 * 60 * 1000;

export const DEMO_AGENT_ADDRESS = 'bookie@contoso.example';
export const DEMO_ACCOUNTS_MAILBOX = 'accounts@contoso.example';

export const DEMO_SHARED_MAILBOXES: SharedMailbox[] = [
  { address: DEMO_ACCOUNTS_MAILBOX, capture: true },
  { address: 'hello@contoso.example', label: 'Enquiries' },
];

const BOOKIE = { name: 'Bookie', address: DEMO_AGENT_ADDRESS };

interface Sample extends Omit<EmailApprovalDetail, 'requestedAt' | 'expiresAt' | 'status'> {
  hoursAgo: number;
  status?: ApprovalStatus;
}

const SAMPLES: Sample[] = [
  {
    id: 'demo-approval-1',
    hoursAgo: 0.5,
    subject: 'Invoice INV-0041 is now overdue',
    recipients: ['Sam Ortiz'],
    preview:
      'Hello Sam, I hope you are well. Our records show invoice INV-0041 was due last Friday and is still open…',
    from: BOOKIE,
    to: [{ name: 'Sam Ortiz', address: 'sam.ortiz@example.org' }],
    cc: [{ name: 'Priya Nair', address: 'priya.nair@example.com' }],
    bodyType: 'html',
    body: `<p>Hello Sam,</p>
<p>I hope you are well. Our records show invoice <strong>INV-0041</strong> was due last Friday and is still open.</p>
<p>If it has already been paid, thank you, and please ignore this email. If not, could you let me know when we can expect payment?</p>
<p>A copy of the invoice is attached.</p>
<p>Kind regards,<br>Bookie pp Alex Morgan<br>Contoso Coffee Roasters Ltd</p>`,
    hasAttachments: true,
  },
  {
    id: 'demo-approval-2',
    hoursAgo: 6,
    subject: 'RE: Missing invoice for October beans',
    recipients: ['Northwind Packaging'],
    preview:
      'Hello, Thank you for your email. We have not received an invoice for the October delivery yet…',
    from: BOOKIE,
    to: [{ name: 'Northwind Packaging', address: 'accounts@northwind-packaging.example.com' }],
    cc: [],
    bodyType: 'text',
    body: `Hello,

Thank you for your email. We have not received an invoice for the October delivery yet. Could you send it to accounts@contoso.example so we can process it?

Kind regards,
Bookie pp Alex Morgan
Contoso Coffee Roasters Ltd`,
    hasAttachments: false,
  },
  {
    id: 'demo-approval-3',
    hoursAgo: 28,
    subject: 'Remittance advice: payment run 14 October',
    recipients: ['Coho Packaging'],
    preview: 'Hello, Please find attached the remittance advice for our payment run…',
    from: BOOKIE,
    to: [{ name: 'Coho Packaging', address: 'accounts@coho.example' }],
    cc: [],
    bodyType: 'text',
    body: 'Hello,\n\nPlease find attached the remittance advice for our payment run on 14 October.\n\nKind regards,\nBookie pp Alex Morgan',
    hasAttachments: true,
    status: 'approved',
  },
  {
    id: 'demo-approval-4',
    hoursAgo: 50,
    subject: 'Final reminder: invoice INV-0033',
    recipients: ['Fabrikam Hotels accounts'],
    preview: 'Hello, This is a final reminder that invoice INV-0033 remains unpaid…',
    from: BOOKIE,
    to: [{ name: 'Fabrikam Hotels accounts', address: 'accounts@fabrikam.example' }],
    cc: [],
    bodyType: 'text',
    body: 'Hello,\n\nThis is a final reminder that invoice INV-0033 remains unpaid.\n\nBookie pp Alex Morgan',
    hasAttachments: false,
    status: 'rejected',
  },
];

/** Decisions made in this browser's demo session, by sample id. */
export type DemoDecisions = Record<string, 'approved' | 'rejected'>;

function materialise(sample: Sample, decisions: DemoDecisions, now: Date): EmailApprovalDetail {
  const requested = now.getTime() - sample.hoursAgo * HOUR;
  const expires = requested + REQUEST_LIFETIME_MS;
  const status =
    decisions[sample.id] ?? sample.status ?? (now.getTime() >= expires ? 'expired' : 'pending');
  const { hoursAgo: _hoursAgo, status: _status, ...rest } = sample;
  return {
    ...rest,
    requestedAt: new Date(requested).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    status,
  };
}

export function demoApprovals(
  decisions: DemoDecisions = {},
  now: Date = new Date()
): EmailApproval[] {
  return sortApprovals(
    SAMPLES.map((s) => {
      const {
        from: _f,
        to: _t,
        cc: _c,
        bodyType: _bt,
        body: _b,
        hasAttachments: _a,
        ...summary
      } = materialise(s, decisions, now);
      return summary;
    })
  );
}

export function demoApprovalDetail(
  id: string,
  decisions: DemoDecisions = {},
  now: Date = new Date()
): EmailApprovalDetail | null {
  const sample = SAMPLES.find((s) => s.id === id);
  return sample ? materialise(sample, decisions, now) : null;
}

/** The status a decision gives, or null when the sample isn't pending (or doesn't exist). */
export function demoDecide(
  id: string,
  decision: ApprovalDecision,
  decisions: DemoDecisions = {},
  now: Date = new Date()
): 'approved' | 'rejected' | null {
  const detail = demoApprovalDetail(id, decisions, now);
  if (!detail || detail.status !== 'pending') return null;
  return decision === 'approve' ? 'approved' : 'rejected';
}

const MAIL: Record<
  MailboxFolderKey,
  (Omit<MailboxMessage, 'receivedAt'> & { hoursAgo: number })[]
> = {
  inbox: [
    {
      id: 'demo-mail-1',
      hoursAgo: 0.2,
      subject: 'Invoice 7781 from Northwind Packaging',
      from: { name: 'Northwind Packaging', address: 'billing@northwind-packaging.example.com' },
      preview: 'Please find attached invoice 7781 for the October delivery of retail bags.',
      hasAttachments: true,
      isRead: false,
    },
    {
      id: 'demo-mail-2',
      hoursAgo: 1.5,
      subject: 'Your statement for October',
      from: { name: 'Coho Packaging', address: 'statements@coho.example' },
      preview:
        'Your monthly statement is attached. Balance brought forward and new items are listed.',
      hasAttachments: true,
      isRead: true,
    },
  ],
  'needs-review': [
    {
      id: 'demo-mail-3',
      hoursAgo: 20,
      subject: 'Invoice from a new supplier: Tailspin Roastery Supplies',
      from: { name: 'Tailspin Roastery Supplies', address: 'invoices@tailspin.example' },
      preview:
        'Hello, attached is our first invoice for the grinder service. Bank details are on the PDF.',
      hasAttachments: true,
      isRead: true,
    },
  ],
  captured: [
    {
      id: 'demo-mail-4',
      hoursAgo: 26,
      subject: 'Invoice 2209 — green coffee, lot 14',
      from: { name: 'Fourth Coffee Importers', address: 'ar@fourthcoffee.example' },
      preview: 'Invoice 2209 for lot 14 is attached. Payment terms 30 days.',
      hasAttachments: true,
      isRead: true,
    },
    {
      id: 'demo-mail-5',
      hoursAgo: 49,
      subject: 'Electricity bill — September',
      from: { name: 'Litware Energy', address: 'bills@litware.example' },
      preview: 'Your September bill is ready. The amount will be collected by direct debit.',
      hasAttachments: true,
      isRead: true,
    },
  ],
};

export function demoEmailsOverview(
  decisions: DemoDecisions = {},
  now: Date = new Date()
): EmailsOverview {
  return {
    agentAddress: DEMO_AGENT_ADDRESS,
    demo: true,
    approvals: { isApprover: true, status: 'ok', items: demoApprovals(decisions, now) },
    mailboxes: [
      {
        status: 'ok',
        capture: true,
        mailbox: DEMO_ACCOUNTS_MAILBOX,
        folders: MAILBOX_FOLDERS.map((folder) => ({
          ...folder,
          messages: MAIL[folder.key].map(({ hoursAgo, ...m }) => ({
            ...m,
            receivedAt: new Date(now.getTime() - hoursAgo * HOUR).toISOString(),
          })),
        })),
      },
      {
        status: 'ok',
        mailbox: 'hello@contoso.example',
        label: 'Enquiries',
        folders: [
          {
            key: 'inbox',
            label: 'Inbox',
            path: '',
            messages: [
              {
                id: 'demo-enquiry-1',
                subject: 'Fabrikam wholesale enquiry',
                from: { name: 'Fabrikam', address: 'hello@fabrikam.example' },
                preview: 'Could you send your wholesale coffee catalogue?',
                hasAttachments: false,
                isRead: false,
                receivedAt: new Date(now.getTime() - HOUR).toISOString(),
              },
              {
                id: 'demo-enquiry-2',
                subject: 'Northwind delivery enquiry',
                from: { name: 'Northwind', address: 'hello@northwind.example' },
                preview: 'Which days do you deliver to our area?',
                hasAttachments: false,
                isRead: true,
                receivedAt: new Date(now.getTime() - 2 * HOUR).toISOString(),
              },
            ],
          },
        ],
      },
    ],
  };
}
