import { cn } from '@/lib/ui/cn';

/**
 * Bookie's face for small spaces: the house robot visor with green eyes.
 * Replaced by the rendered avatar image once `public/bookie/avatar.png` exists.
 */
export function BookieAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'ring-brand/40 relative inline-flex overflow-hidden rounded-full bg-[#0d1424] ring-1',
        className ?? 'h-8 w-8'
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bookie/avatar-64.png"
        alt="Bookie"
        className="h-full w-full object-cover"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
    </span>
  );
}
