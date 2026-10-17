import { cn } from '@/lib/ui/cn';

/**
 * Bookie's mark: his robot head, with a dark visor and his warm gold eyes (centre #FFF1C2,
 * rim #FFC85A, as in agent/assets/bookie-character.md), on the brand-green tile.
 * The same drawing as app/icon.svg; solid circles rather than gradients, so it needs no ids.
 */
export function LogoTile({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={cn(
        'inline-block shrink-0 rounded-lg shadow-[0_6px_20px_-6px_rgb(34_197_94/0.6)]',
        className ?? 'h-8 w-8'
      )}
    >
      <rect width="32" height="32" rx="7" fill="#22c55e" />
      <rect x="4" y="7" width="24" height="18" rx="8" fill="#ffffff" />
      <rect x="7" y="11.5" width="18" height="9" rx="4.5" fill="#020817" />
      {[11.8, 20.2].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="16" r="3.3" fill="#FFC85A" fillOpacity="0.3" />
          <circle cx={cx} cy="16" r="2.2" fill="#FFC85A" />
          <circle cx={cx} cy="16" r="1.5" fill="#FFF1C2" />
        </g>
      ))}
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
