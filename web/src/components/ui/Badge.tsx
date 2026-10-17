import { cn } from '@/lib/ui/cn';

export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-body border-line-strong',
  green: 'bg-brand/10 text-brand-bright border-brand/30',
  amber: 'bg-warn/10 text-warn border-warn/30',
  red: 'bg-danger/10 text-danger border-danger/30',
  blue: 'bg-info/10 text-info border-info/30',
  violet: 'bg-violet/10 text-violet border-violet/30',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  submitted: { label: 'Awaiting approval', tone: 'violet' },
  authorised: { label: 'Awaiting payment', tone: 'blue' },
  overdue: { label: 'Overdue', tone: 'red' },
  paid: { label: 'Paid', tone: 'green' },
  voided: { label: 'Voided', tone: 'neutral' },
  deleted: { label: 'Deleted', tone: 'neutral' },
  sent: { label: 'Sent', tone: 'blue' },
  accepted: { label: 'Accepted', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  invoiced: { label: 'Invoiced', tone: 'violet' },
  billed: { label: 'Billed', tone: 'violet' },
  posted: { label: 'Posted', tone: 'green' },
  registered: { label: 'Registered', tone: 'green' },
  disposed: { label: 'Disposed', tone: 'neutral' },
  active: { label: 'Active', tone: 'green' },
  archived: { label: 'Archived', tone: 'neutral' },
  terminated: { label: 'Left', tone: 'neutral' },
  'in-progress': { label: 'In progress', tone: 'blue' },
  closed: { label: 'Closed', tone: 'neutral' },
};

/** Status pill. Pass `overdue` to override an authorised document's label. */
export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const s = overdue
    ? STATUS.overdue
    : (STATUS[status] ?? { label: status, tone: 'neutral' as Tone });
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
