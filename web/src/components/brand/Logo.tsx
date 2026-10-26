import { cn } from '@/lib/ui/cn';

/**
 * Bookie's mark, in the KnowAll app-icon family: a near-black glyph (his robot head, two
 * antennae and lime eyes) on the lime tile. The same drawing as app/icon.svg, coloured
 * with the brand tokens.
 */
export function LogoTile({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn(
        'fill-brand inline-block shrink-0 rounded-lg shadow-[0_6px_20px_-6px_rgb(157_255_10/0.45)]',
        className ?? 'h-8 w-8'
      )}
    >
      <rect width="32" height="32" rx="7" />
      <path
        d="M11 9.5 9.8 5.2M21 9.5l1.2-4.3"
        fill="none"
        className="stroke-glyph"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="4" y="9" width="24" height="17" rx="7.5" className="fill-glyph" />
      <circle cx="11.6" cy="17.5" r="3" />
      <circle cx="20.4" cy="17.5" r="3" />
    </svg>
  );
}

export function Logo({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const tile = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-11 w-11' }[size];
  const text = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' }[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoTile className={tile} />
      <span className={cn('text-ink font-bold tracking-tight', text)}>Bookie</span>
    </span>
  );
}
