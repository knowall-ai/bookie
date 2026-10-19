'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertCircle, AlertTriangle, ArrowRight, Check, Info, Mail, X } from 'lucide-react';
import { invoiceAction } from '@/lib/portal/actions/invoices';
import type { BookieSuggestion } from '@/lib/bookie/suggestion-types';
import { formatDate } from '@/lib/ui/format';
import { cn } from '@/lib/ui/cn';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Money } from '@/components/ui/Money';

const SEVERITY = {
  issue: { icon: AlertCircle, className: 'text-danger', label: 'Needs doing now' },
  warning: { icon: AlertTriangle, className: 'text-warn', label: 'Needs doing soon' },
  info: { icon: Info, className: 'text-info', label: 'Worth doing' },
} as const;

/** Dismissed for this browser session only; nothing is stored on the server. */
const dismissedKey = (orgKey: string) => `bookie:dismissed:${orgKey}`;

function readDismissed(orgKey: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(dismissedKey(orgKey)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * Bookie's suggested next steps, each with a button: a link to the right page, or a
 * write (approve, email) the user confirms first. Like Poppie's recommendations in Thyme.
 */
export function BookieSuggestions({
  orgKey,
  suggestions,
  onNavigate,
  className,
}: {
  orgKey: string;
  suggestions: BookieSuggestion[];
  /** Called when a card's link is followed (e.g. to close the chat panel). */
  onNavigate?: () => void;
  className?: string;
}) {
  const [dismissed, setDismissed] = useState(() => readDismissed(orgKey));
  const shown = suggestions.filter((s) => !dismissed.includes(s.id));
  if (shown.length === 0) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    sessionStorage.setItem(dismissedKey(orgKey), JSON.stringify(next));
    setDismissed(next);
  };

  return (
    <ul
      aria-label="Bookie's suggestions"
      className={cn('space-y-2', className)}
      data-testid="bookie-suggestions"
    >
      {shown.map((s) => (
        <SuggestionCard
          key={s.id}
          orgKey={orgKey}
          suggestion={s}
          onDismiss={() => dismiss(s.id)}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function SuggestionCard({
  orgKey,
  suggestion,
  onDismiss,
  onNavigate,
}: {
  orgKey: string;
  suggestion: BookieSuggestion;
  onDismiss: () => void;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const { title, reason, subject, action } = suggestion;
  const severity = SEVERITY[suggestion.severity];
  const Icon = severity.icon;

  const run = () =>
    start(async () => {
      if (action.kind !== 'invoice') return;
      const result = await invoiceAction(orgKey, action.invoiceId, action.action);
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(action.done);
      setDone(true);
      router.refresh();
    });

  return (
    <li
      className="bg-surface border-line rounded-xl border px-3 py-2.5"
      data-testid="bookie-suggestion"
    >
      <div className="flex items-start gap-2">
        <Icon
          className={cn('mt-0.5 h-4 w-4 shrink-0', severity.className)}
          aria-label={severity.label}
        />
        <div className="min-w-0 flex-1">
          <p className="text-ink text-sm font-medium">{title}</p>
          <p className="text-muted mt-0.5 text-xs">{reason}</p>
          {subject && (
            <p className="text-body mt-1 flex flex-wrap items-center gap-x-1.5 text-xs">
              <Link
                href={subject.href}
                onClick={onNavigate}
                className="hover:text-ink underline-offset-2 hover:underline"
              >
                {subject.label}
              </Link>
              {subject.contact && <span className="text-muted">· {subject.contact}</span>}
              {subject.kind === 'invoice' && (
                <span className="text-muted">
                  ·{' '}
                  <Money
                    amount={subject.amountDue}
                    currency={subject.currency}
                    missing="The source doesn't report what's left to pay"
                  />{' '}
                  due
                </span>
              )}
              {subject.dueDate && (
                <span className={subject.overdue ? 'text-danger' : 'text-muted'}>
                  · {subject.overdue ? 'overdue since' : 'by'} {formatDate(subject.dueDate)}
                </span>
              )}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {done ? (
              <span className="text-brand-bright flex items-center gap-1 text-xs font-medium">
                <Check className="h-3.5 w-3.5" /> Done
              </span>
            ) : action.kind === 'link' ? (
              <ButtonLink href={action.href} size="sm" onClick={onNavigate}>
                {action.label} <ArrowRight className="h-3.5 w-3.5" />
              </ButtonLink>
            ) : (
              <Button
                size="sm"
                variant={action.action === 'approve' ? 'primary' : 'secondary'}
                onClick={() => setConfirming(true)}
                disabled={pending}
              >
                {action.action === 'approve' ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                {action.label}
              </Button>
            )}
            {!done && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                aria-label={`Dismiss: ${title}`}
              >
                <X className="h-3.5 w-3.5" /> Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
      {confirming && action.kind === 'invoice' && (
        <ConfirmDialog
          title={action.confirm.title}
          body={action.confirm.body}
          cta={action.confirm.cta}
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={run}
        />
      )}
    </li>
  );
}
