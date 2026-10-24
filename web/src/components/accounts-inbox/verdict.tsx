import { Badge, type Tone } from '@/components/ui/Badge';
import type { InboxItem } from '@/lib/accounts-inbox/review';
import type { DocumentKind } from '@/lib/accounts-inbox/extraction';

export const KIND_LABEL: Record<DocumentKind, string> = {
  invoice: 'Invoice',
  'credit-note': 'Credit note',
  statement: 'Statement',
  remittance: 'Remittance advice',
  receipt: 'Receipt',
  other: 'Other',
};

/** Why a new item isn't simply ready: review notes, supplier questions, unverified mail. */
export function reviewReasons(item: InboxItem): string[] {
  const out: string[] = [];
  if (item.trust.level === 'unverified') out.push(...item.trust.reasons);
  if (item.supplier?.status === 'several') out.push(item.supplier.reason);
  if (item.bank?.status === 'unknown')
    out.push("bank details on the invoice can't be checked against the supplier's record");
  for (const n of item.reading?.needsReview ?? []) out.push(`${n.field}: ${n.reason}`);
  return out;
}

export function verdictLabel(item: InboxItem): { label: string; tone: Tone } {
  const v = item.verdict;
  switch (v.kind) {
    case 'suspicious':
      return { label: 'Suspicious', tone: 'red' };
    case 'in-books':
      return v.match.status === 'same'
        ? { label: 'Already in the books', tone: 'green' }
        : { label: 'Different in the books', tone: 'amber' };
    case 'new':
      return reviewReasons(item).length
        ? { label: 'New, needs review', tone: 'amber' }
        : { label: 'New, ready to file', tone: 'blue' };
    case 'not-invoice':
      return { label: 'Not an invoice', tone: 'neutral' };
    case 'unread':
      return { label: "Couldn't read", tone: 'neutral' };
  }
}

export function VerdictBadge({ item }: { item: InboxItem }) {
  const { label, tone } = verdictLabel(item);
  return (
    <Badge tone={tone} className="gap-1">
      {item.verdict.kind === 'suspicious' && <span aria-hidden>⚠️</span>}
      {label}
    </Badge>
  );
}

/** One line saying why, for the list. */
export function verdictDetail(item: InboxItem): string {
  const v = item.verdict;
  switch (v.kind) {
    case 'suspicious':
      return v.reasons.join('; ');
    case 'in-books':
      return v.match.reason;
    case 'new': {
      const supplier =
        item.supplier?.status === 'matched'
          ? item.supplier.contact.name
          : item.supplier?.status === 'none'
            ? 'new supplier'
            : 'supplier to choose';
      const reasons = reviewReasons(item);
      return reasons.length ? `${supplier}; needs review: ${reasons.join('; ')}` : supplier;
    }
    case 'not-invoice':
      return `${KIND_LABEL[v.documentKind]}: ${v.reason}`;
    case 'unread':
      return v.reason;
  }
}
