'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Bookie's face for small spaces: a head-and-shoulders crop of his profile
 * photo (`public/bookie/avatar-64.png`, with `avatar-192.png` for sharp
 * screens and larger sizes), framed so the green eyeshade and gold eyes still
 * read inside a 28px circle. If the image cannot load, falls back to a drawn
 * ivory helmet with the eyeshade and two gold eyes, so there is never a broken
 * image or stray alt text.
 *
 * Decorative by default (the surrounding control carries the label); pass
 * `label` when the avatar stands alone.
 */
export function BookieAvatar({
  className,
  size = 'sm',
  label,
}: {
  className?: string;
  /** `sm` loads the 64px image (192px on high-density screens); `lg` the 192px one. */
  size?: 'sm' | 'lg';
  label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // The image may fail before React hydrates and attaches onError: check once on mount.
  useEffect(() => {
    const el = img.current;
    if (el?.complete && el.naturalWidth === 0) setFailed(true);
  }, []);
  const src = size === 'lg' ? '/bookie/avatar-192.png' : '/bookie/avatar-64.png';
  const srcSet = size === 'lg' ? undefined : '/bookie/avatar-64.png 1x, /bookie/avatar-192.png 2x';

  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'ring-brand/40 relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#0d1424] ring-1',
        className ?? 'h-8 w-8'
      )}
    >
      {failed ? (
        <BookieFace />
      ) : (
        // A plain <img>: tiny, already optimised, and needs onError for the fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={src}
          srcSet={srcSet}
          alt=""
          draggable={false}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/** Vector fallback: ivory helmet, green eyeshade, dark visor and two gold eyes. */
function BookieFace() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="bookie-eye" r="0.5">
          <stop offset="0" stopColor="#fff1c2" />
          <stop offset="0.55" stopColor="#ffc85a" />
          <stop offset="1" stopColor="#ffc85a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" fill="#3b2a1c" />
      <path d="M6 32c0-6 4.5-9.5 10-9.5S26 26 26 32z" fill="#f2e8d8" />
      <rect x="12.5" y="20" width="7" height="3.5" rx="1" fill="#19110b" />
      <path d="M11 6.5 10.4 3.2M21 6.5l.6-3.3" stroke="#d4a64a" strokeWidth="0.9" />
      <circle cx="10.3" cy="2.8" r="1" fill="#d4a64a" />
      <circle cx="21.7" cy="2.8" r="1" fill="#d4a64a" />
      <ellipse cx="16" cy="13.5" rx="9.5" ry="9" fill="#f2e8d8" />
      <rect x="8.6" y="10.6" width="14.8" height="7.6" rx="3.6" fill="#110b06" />
      <path
        d="M7 9.2c3-2.4 15-2.4 18 0l-1 2c-3-1.3-13-1.3-16 0z"
        fill="#22c55e"
        fillOpacity="0.9"
      />
      <circle cx="12.6" cy="14.4" r="2.4" fill="url(#bookie-eye)" />
      <circle cx="19.4" cy="14.4" r="2.4" fill="url(#bookie-eye)" />
    </svg>
  );
}
