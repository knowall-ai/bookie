'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MessageCircle, Mic, X } from 'lucide-react';
import { BookieAvatar } from '@/components/bookie/BookieAvatar';
import { PUBLIC_LIMITS } from '@/lib/public-bookie/shared';

// The panel (chat, voice, verification) only downloads when a visitor opens it.
const PublicBookiePanel = dynamic(
  () => import('./PublicBookiePanel').then((m) => m.PublicBookiePanel),
  { ssr: false }
);

type View = 'closed' | 'choice' | 'panel';

/**
 * Floating "Ask Bookie" button on the public site (never the portal).
 * Clicking it offers a choice, as Winnie does on the ticketing site: chat by
 * text, or talk by voice. Either opens the same panel; voice starts the call.
 *
 * The site pages are static, so the kill switch is read at runtime from
 * /api/public/status: when the helper is off, no button appears.
 */
export function PublicBookieLauncher() {
  const [status, setStatus] = useState<{ enabled: boolean; voice: boolean } | null>(null);
  const [view, setView] = useState<View>('closed');
  const [mode, setMode] = useState<'chat' | 'voice'>('chat');
  const [voiceRequest, setVoiceRequest] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const choiceId = useId();
  const titleId = useId();

  const close = useCallback(() => {
    setView('closed');
    // The button is hidden while the choice or panel is open: focus it once it is back.
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

  useEffect(() => {
    if (view !== 'choice') return;
    firstChoice.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [view, close]);

  if (!status?.enabled) return null;
  const voiceAvailable = status.voice;

  const choose = (chosen: 'chat' | 'voice') => {
    setMode(chosen);
    setLoaded(true);
    setView('panel');
    if (chosen === 'voice') setVoiceRequest((n) => n + 1);
  };

  return (
    <>
      {view === 'choice' && (
        <section
          id={choiceId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-testid="public-bookie-choice"
          className="bg-canvas border-line-strong fixed right-4 bottom-4 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border shadow-2xl sm:right-5 sm:bottom-5"
        >
          <div className="border-line flex items-start gap-3 border-b p-4">
            <BookieAvatar className="h-12 w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-ink font-semibold">
                Hello, I&rsquo;m Bookie
              </h2>
              <p className="text-body mt-1 text-sm leading-relaxed">
                Ask me how Bookie works, about security, installing it or booking a demo, by text or
                by voice.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="text-muted hover:text-ink -m-1 rounded-md p-1"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-2 p-4">
            <button
              ref={firstChoice}
              type="button"
              onClick={() => choose('chat')}
              data-testid="public-bookie-choose-chat"
              className="bg-brand text-brand-ink hover:bg-brand-bright inline-flex h-11 items-center justify-center gap-2 rounded-lg font-semibold motion-safe:transition-colors"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" /> Chat with Bookie
            </button>
            <button
              type="button"
              onClick={() => choose('voice')}
              disabled={!voiceAvailable}
              aria-describedby={`${choiceId}-voice`}
              data-testid="public-bookie-choose-voice"
              className="border-brand/50 text-ink hover:bg-brand/10 inline-flex h-11 items-center justify-center gap-2 rounded-lg border font-semibold disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent motion-safe:transition-colors"
            >
              <Mic className="text-brand-bright h-5 w-5" aria-hidden="true" /> Talk to Bookie
            </button>
            <p id={`${choiceId}-voice`} className="text-muted pt-1 text-center text-xs">
              {voiceAvailable
                ? `A voice call uses your microphone, up to ${PUBLIC_LIMITS.voiceMaxSeconds / 60} minutes.`
                : 'Voice isn’t available just now, but you can chat.'}
            </p>
            <p className="text-muted text-center text-xs">
              The public helper can&rsquo;t see anyone&rsquo;s accounts.
            </p>
          </div>
        </section>
      )}
      <button
        ref={button}
        type="button"
        onClick={() => setView('choice')}
        aria-expanded={view !== 'closed'}
        aria-haspopup="dialog"
        aria-controls={view === 'choice' ? choiceId : undefined}
        data-testid="public-bookie-launcher"
        hidden={view !== 'closed'}
        className="border-brand/50 bg-surface/95 text-ink hover:border-brand hover:bg-surface-2 fixed right-4 bottom-4 z-40 flex items-center gap-2.5 rounded-full border py-1.5 pr-4 pl-1.5 text-sm font-semibold shadow-[0_10px_30px_-10px_rgb(34_197_94/0.55)] backdrop-blur motion-safe:transition-colors sm:right-5 sm:bottom-5"
      >
        <BookieAvatar className="h-9 w-9" />
        Ask Bookie
      </button>
      {loaded && (
        <PublicBookiePanel
          open={view === 'panel'}
          mode={mode}
          voiceRequest={voiceRequest}
          voiceAvailable={voiceAvailable}
          onClose={close}
        />
      )}
    </>
  );
}
