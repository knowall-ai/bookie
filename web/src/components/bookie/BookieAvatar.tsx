'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';

/**
 * Bookie's face for small spaces. Uses the rendered portrait
 * (`public/bookie/avatar-64.png`, or the 512px version for larger sizes);
 * if the image cannot load, falls back to a drawn visor with two green eyes,
 * so there is never a broken image or stray alt text.
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
  /** `sm` loads the 64px image; `lg` the 512px portrait. */
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
  const src = size === 'lg' ? '/bookie/avatar.png' : '/bookie/avatar-64.png';

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

/** Vector fallback: helmet, green eyeshade and two glowing eyes. */
function BookieFace() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id="bookie-eye" r="0.5">
          <stop offset="0" stopColor="#bbf7d0" />
          <stop offset="0.45" stopColor="#4ade80" />
          <stop offset="1" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" fill="#0d1424" />
      <path d="M7 31c0-7 4-11 9-11s9 4 9 11z" fill="#2a3140" />
      <path d="M8.5 6.5 7.6 3.4M23.5 6.5l.9-3.1" stroke="#4b5566" strokeWidth="1.1" />
      <circle cx="7.5" cy="3" r="1.2" fill="#6b7586" />
      <circle cx="24.5" cy="3" r="1.2" fill="#6b7586" />
      <ellipse cx="16" cy="14" rx="10" ry="9.5" fill="#3a4252" />
      <rect x="8.2" y="11" width="15.6" height="8" rx="4" fill="#070b12" />
      <path
        d="M6.5 9.6c3-2.2 16-2.2 19 0l-1.2 2.2c-3-1.4-13.6-1.4-16.6 0z"
        fill="#22c55e"
        fillOpacity="0.85"
      />
      <circle cx="12.6" cy="15" r="2.6" fill="url(#bookie-eye)" />
      <circle cx="19.4" cy="15" r="2.6" fill="url(#bookie-eye)" />
    </svg>
  );
}
