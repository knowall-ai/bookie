'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Check, ChevronDown, ChevronUp, MailCheck, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/States';
import { MAX_REASON_LENGTH } from '@/lib/email/approvals';
import { recipientSummary } from '@/lib/email/mailbox';
import type {
  MailAgent,
  ApprovalStatus,
  EmailAddress,
  EmailApproval,
  EmailApprovalDetail,
} from '@/lib/email/types';
import { decideEmailApprovalAction, emailApprovalDetailAction } from '@/lib/portal/actions/email';
import { formatDateTimeUk } from '@/lib/ui/format';
import { PENDING_CHANGED } from './pending';

// Modelled on knowall-ai/agents-portal's ApprovalsPanel (PR #143), so Bookie's held
// email looks and behaves the same in both portals.

const STATUS: Record<ApprovalStatus, { label: string; tone: Tone; title?: string }> = {
  pending: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  decided: {
    label: 'Decided elsewhere',
    tone: 'neutral',
    title: 'Answered in Outlook or by another moderator, or the request was deleted',
  },
  expired: {
    label: 'Expired',
    tone: 'neutral',
    title: 'Nobody decided within two days, so Exchange returned it to the sending agent',
  },
};

function people(list: EmailAddress[]): string {
  return list.map((p) => (p.name ? `${p.name} <${p.address}>` : p.address)).join('; ');
}

/**
 * The held email's HTML in a sandboxed frame: no scripts, links open in a new tab,
 * and its own CSP keeps remote images and tracking pixels from loading.
 */
function HtmlBody({ html }: { html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
<base target="_blank">
<style>body{margin:0;padding:16px;font:14px/1.5 system-ui,sans-serif;color:#1f2937;background:#fff;word-wrap:break-word}img{max-width:100%}</style>
</head><body>${html}</body></html>`;
  return (
    <iframe
      ref={frame}
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      className="border-line w-full rounded-lg border bg-white"
      style={{ height }}
      onLoad={() => {
        const body = frame.current?.contentDocument?.body;
        if (body) setHeight(Math.min(Math.max(body.scrollHeight + 4, 120), 720));
      }}
    />
  );
}

function EmailView({ detail }: { detail: EmailApprovalDetail }) {
  const rows: [string, string][] = [
    ...(detail.from ? [['From', people([detail.from])] as [string, string]] : []),
    ['To', people(detail.to) || detail.recipients.join('; ')],
    ...(detail.cc.length > 0 ? [['Cc', people(detail.cc)] as [string, string]] : []),
    ['Subject', detail.subject],
  ];
  return (
    <div className="space-y-3" data-testid="approval-email">
      <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="text-ink min-w-0 [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
      {detail.hasAttachments && (
        <p className="text-muted flex items-center gap-1 text-xs">
          <Paperclip className="h-3 w-3" /> Has attachments. Open the request in Outlook to check
          them.
        </p>
      )}
      {detail.bodyType === 'html' ? (
        <HtmlBody html={detail.body} />
      ) : (
        <pre className="border-line bg-surface-2 text-ink max-h-[720px] overflow-auto rounded-lg border p-4 font-sans text-sm whitespace-pre-wrap">
          {detail.body}
        </pre>
      )}
    </div>
  );
}

function When({ iso, prefix = '' }: { iso: string; prefix?: string }) {
  return (
    // UK time for the tooltip, the same on server and browser; "x minutes ago" can tick over
    // between the two renders, so React is told not to warn about it.
    <time dateTime={iso} title={formatDateTimeUk(iso, true)} suppressHydrationWarning>
      {prefix}
      {formatDistanceToNow(new Date(iso), { addSuffix: true })}
    </time>
  );
}

function ApprovalRow({
  item,
  agentName,
  showAgent,
  expanded,
  onToggle,
  busy,
  onApprove,
  onReject,
}: {
  item: EmailApproval;
  agentName: string;
  showAgent: boolean;
  expanded: boolean;
  onToggle: () => void;
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [detail, setDetail] = useState<EmailApprovalDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const pending = item.status === 'pending';
  const status = STATUS[item.status];
  const bodyId = `approval-${item.id.slice(-12)}`;

  const toggle = () => {
    if (!expanded && !detail) {
      startLoading(async () => {
        const result = await emailApprovalDetailAction(item.id);
        if (result.ok) setDetail(result.data);
        else setDetailError(result.error);
      });
    }
    onToggle();
  };

  return (
    <li className="card overflow-hidden" data-testid="approval-row">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="focus-visible:ring-brand flex min-w-0 flex-1 items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2"
        >
          <span className="text-muted mt-0.5 shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate font-medium">{item.subject}</span>
            {showAgent && <span className="text-muted block text-sm">From {agentName}</span>}
            <span className="text-body mt-0.5 block truncate text-sm">
              To {recipientSummary(item.recipients) || 'recipients not shown by Exchange'}
              <span className="text-muted">
                {' · '}
                <When iso={item.requestedAt} />
                {pending && (
                  <>
                    {' · '}
                    <span
                      className={
                        new Date(item.expiresAt).getTime() - now < 6 * 60 * 60 * 1000
                          ? 'text-warn'
                          : undefined
                      }
                    >
                      <When iso={item.expiresAt} prefix="expires " />
                    </span>
                  </>
                )}
              </span>
            </span>
            {!expanded && item.preview && (
              <span className="text-muted mt-1 line-clamp-2 block text-sm [overflow-wrap:anywhere]">
                {item.preview}
              </span>
            )}
          </span>
        </button>

        <span title={status.title}>
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>

        {pending && (
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!expanded) toggle();
                setRejecting(true);
              }}
            >
              <X className="h-3.5 w-3.5" /> Reject
            </Button>
            <Button variant="primary" size="sm" disabled={busy} onClick={onApprove}>
              <Check className="h-3.5 w-3.5" /> Approve
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div id={bodyId} className="border-line border-t p-4">
          {loading && !detail ? (
            <p className="text-muted py-4 text-sm">Loading the email…</p>
          ) : detailError && !detail ? (
            <p className="text-danger text-sm">Couldn’t load the email: {detailError}</p>
          ) : detail ? (
            <EmailView detail={detail} />
          ) : null}
        </div>
      )}

      {expanded && rejecting && pending && (
        <div className="border-line space-y-3 border-t p-4">
          <label htmlFor={`${bodyId}-reason`} className="text-body block text-sm font-medium">
            Why are you rejecting it? {agentName} gets this with the rejection notice.
          </label>
          <Textarea
            id={`${bodyId}-reason`}
            rows={3}
            maxLength={MAX_REASON_LENGTH}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`What should ${agentName} change before sending again?`}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRejecting(false);
                setReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={!reason.trim() || busy}
              onClick={() => onReject(reason.trim())}
              data-testid="confirm-reject"
            >
              <X className="h-3.5 w-3.5" /> {busy ? 'Rejecting…' : 'Reject email'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Bookie's external emails held by Exchange for the signed-in moderator. Each row
 * opens to the full email; Approve (confirmed) or Reject with a reason sends the same
 * vote Outlook's buttons do. Pending first; the last two weeks' decided ones below.
 */
export function ApprovalsList({ items, agents }: { items: EmailApproval[]; agents: MailAgent[] }) {
  const agentName = (item: EmailApproval) =>
    agents.find((a) => a.id === item.agentId)?.displayName ??
    (agents.length === 1 ? agents[0].displayName : 'The agent');
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<EmailApproval | null>(null);
  const [busy, startBusy] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Decisions made here, shown before the page refreshes. */
  const [decided, setDecided] = useState<Record<string, ApprovalStatus>>({});

  const shown = items.map((i) => (decided[i.id] ? { ...i, status: decided[i.id] } : i));
  const pending = shown.filter((i) => i.status === 'pending');
  const recent = shown.filter((i) => i.status !== 'pending');

  const decide = (item: EmailApproval, decision: 'approve' | 'reject', reason?: string) => {
    setBusyId(item.id);
    startBusy(async () => {
      const result = await decideEmailApprovalAction({ id: item.id, decision, reason });
      setBusyId(null);
      setConfirming(null);
      if (!result.ok) return void toast.error(result.error);
      setDecided((d) => ({ ...d, [item.id]: result.data.status }));
      if (expanded === item.id) setExpanded(null);
      toast.success(
        decision === 'approve'
          ? 'Approved. Exchange is sending the email.'
          : `Rejected. ${agentName(item)} will get your reason.`
      );
      // The Email tab's badge: drop its cached count so it re-reads now.
      try {
        for (const k of Object.keys(sessionStorage)) {
          if (k.startsWith('["email-pending"')) sessionStorage.removeItem(k);
        }
      } catch {
        /* Storage may be disabled. */
      }
      window.dispatchEvent(new Event(PENDING_CHANGED));
      router.refresh();
    });
  };

  const row = (item: EmailApproval) => (
    <ApprovalRow
      key={item.id}
      item={item}
      agentName={agentName(item)}
      showAgent={agents.length > 1}
      expanded={expanded === item.id}
      onToggle={() => setExpanded((e) => (e === item.id ? null : item.id))}
      busy={busy && busyId === item.id}
      onApprove={() => setConfirming(item)}
      onReject={(reason) => decide(item, 'reject', reason)}
    />
  );

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <EmptyState
          icon={<MailCheck className="h-6 w-6" />}
          title="Nothing waiting for you"
          body={`When Exchange holds an email ${agents.length === 1 ? agents[0].displayName + ' sends' : 'an agent sends'} outside your organisation, it appears here for you to approve or reject.`}
        />
      ) : (
        <ul className="space-y-3" aria-label="Awaiting approval">
          {pending.map(row)}
        </ul>
      )}

      {recent.length > 0 && (
        <details className="group">
          <summary className="text-muted hover:text-ink cursor-pointer text-sm">
            Recent ({recent.length}), the last two weeks
          </summary>
          <ul className="mt-3 space-y-3">{recent.map(row)}</ul>
        </details>
      )}

      {confirming && (
        <ConfirmDialog
          title="Approve this email?"
          body={
            <span className="[overflow-wrap:anywhere]">
              Exchange sends “{confirming.subject}” to{' '}
              {recipientSummary(confirming.recipients) || 'its recipients'} straight away. This
              can’t be undone.
            </span>
          }
          cta="Approve and send"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => decide(confirming, 'approve')}
        />
      )}
    </div>
  );
}
