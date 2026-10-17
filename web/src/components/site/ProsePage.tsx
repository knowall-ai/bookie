import { cn } from '@/lib/ui/cn';
import { Container, DoubleRule, display } from './ui';

/**
 * Long-form page (privacy, terms, security, install): a display-serif title,
 * a ledger double rule, and readable prose set in a single column.
 */
export function ProsePage({
  title,
  lead,
  updated,
  children,
  aside,
}: {
  title: string;
  lead?: React.ReactNode;
  updated?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="grid-glow">
      <Container className="pt-16 pb-24 sm:pt-24">
        <header className="max-w-3xl">
          <h1
            className={cn(
              display,
              'text-ink text-[2.5rem] leading-[1.05] font-medium tracking-[-0.02em] text-balance sm:text-6xl'
            )}
          >
            {title}
          </h1>
          {lead && <p className="text-body mt-5 text-lg leading-relaxed text-pretty">{lead}</p>}
          {updated && <p className="text-faint mt-4 text-sm">Last updated {updated}</p>}
        </header>
        <DoubleRule className="mt-10 max-w-3xl" />
        <div className="mt-12 grid gap-14 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className={prose}>{children}</div>
          {aside && <aside className="lg:pt-2">{aside}</aside>}
        </div>
      </Container>
    </div>
  );
}

/** Prose styling for long-form copy, scoped to direct descendants. */
export const prose = cn(
  'max-w-3xl text-body leading-relaxed',
  '[&_h2]:text-ink [&_h2]:mt-12 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-medium [&_h2]:tracking-tight [&_h2:first-child]:mt-0',
  '[&_h2]:font-[family-name:var(--font-display)] sm:[&_h2]:text-[1.75rem]',
  '[&_h3]:text-ink [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-semibold',
  '[&_p]:my-4 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5',
  '[&_li]:marker:text-brand [&_strong]:text-ink',
  '[&_a]:text-brand-bright [&_a]:underline [&_a]:decoration-brand/40 [&_a]:underline-offset-2 hover:[&_a]:decoration-brand-bright',
  '[&_code]:bg-surface-2 [&_code]:text-ink [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]'
);
