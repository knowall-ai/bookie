'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookieAvatar } from '@/components/bookie/BookieAvatar';

// The panel (chat, voice, verification) only downloads when a visitor opens it.
const PublicBookiePanel = dynamic(
  () => import('./PublicBookiePanel').then((m) => m.PublicBookiePanel),
  { ssr: false }
);

/**
 * Floating "Talk to Bookie" button on the public site (never the portal).
 * The site pages are static, so the kill switch is read at runtime from
 * /api/public/status: when the helper is off, no button appears.
 */
export function PublicBookieLauncher() {
  const [status, setStatus] = useState<{ enabled: boolean; voice: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    // The button is hidden while the panel is open: focus it once it is back.
    requestAnimationFrame(() => button.current?.focus());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public/status')
      .then((r) => (r.ok ? (r.json() as Promise<{ enabled: boolean; voice: boolean }>) : null))
      .then((s) => !cancelled && setStatus(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status?.enabled) return null;
  const voiceAvailable = status.voice;

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="public-bookie-launcher"
        hidden={open}
        className="border-brand/50 bg-surface/95 text-ink hover:border-brand hover:bg-surface-2 fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 text-sm font-semibold shadow-[0_10px_30px_-10px_rgb(34_197_94/0.55)] backdrop-blur motion-safe:transition-colors sm:right-5 sm:bottom-5"
      >
        <BookieAvatar className="h-9 w-9" />
        Talk to Bookie
      </button>
      {loaded && <PublicBookiePanel open={open} voiceAvailable={voiceAvailable} onClose={close} />}
    </>
  );
}
