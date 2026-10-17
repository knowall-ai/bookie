import { cn } from '@/lib/ui/cn';

/** Bookie's glyph: a "B" drawn as a two-page ledger with ruled lines. */
export function BookieGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} fill="none">
      <path
        d="M8 6.5h9.25a5.25 5.25 0 0 1 0 10.5H8z M8 15.5h10.5a5.75 5.75 0 0 1 0 11.5H8z"
        fill="currentColor"
      />
      <path
        d="M11 10.25h6 M11 13.25h4.5 M11 19.75h7 M11 22.75h5"
        stroke="var(--glyph-cut, #22c55e)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LogoTile({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-brand text-brand-ink inline-flex items-center justify-center rounded-lg shadow-[0_6px_20px_-6px_rgb(34_197_94/0.6)]',
        className ?? 'h-8 w-8'
      )}
    >
      <BookieGlyph className="h-[70%] w-[70%]" />
    </span>
  );
}

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const tile = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-11 w-11' }[size];
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' }[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoTile className={tile} />
      <span className={cn('text-ink font-bold tracking-tight', text)}>Bookie</span>
    </span>
  );
}
