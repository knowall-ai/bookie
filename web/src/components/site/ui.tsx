import { cn } from '@/lib/ui/cn';

/** The site's display face (Newsreader), loaded in app/(site)/layout.tsx. */
export const display = 'font-[family-name:var(--font-display)]';

export const GITHUB_URL = 'https://github.com/knowall-ai/bookie';

/** Page-width container used by every public section. */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)}>{children}</div>;
}

/** Section heading in the display serif, with an optional lead paragraph. */
export function SectionHeading({
  id,
  title,
  lead,
  className,
}: {
  id?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <h2
        id={id}
        className={cn(
          display,
          'text-ink scroll-mt-24 text-[2rem] leading-[1.08] font-medium tracking-[-0.015em] text-balance sm:text-[2.6rem]'
        )}
      >
        {title}
      </h2>
      {lead && <p className="text-body mt-4 text-lg leading-relaxed text-pretty">{lead}</p>}
    </div>
  );
}

/**
 * The accountant's double rule: drawn under a total to say "this balances".
 * Bookie uses it sparingly, under things that are finished.
 */
export function DoubleRule({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('block h-[5px] border-y border-[#c8a24a]/70', className)}
    />
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className} fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
