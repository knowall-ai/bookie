'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, Info, Mic, MicOff, PhoneOff, RotateCcw, X } from 'lucide-react';
import { BookieAvatar } from '@/components/bookie/BookieAvatar';
import { PUBLIC_LIMITS, PUBLIC_NOTICE, type PublicChatMessage } from '@/lib/public-bookie/shared';
import { cn } from '@/lib/ui/cn';
import { clearPass, getPass as fetchPass } from './pass-client';
import { ReplyText } from './ReplyText';
import { usePublicVoice } from './usePublicVoice';

interface Message extends PublicChatMessage {
  via?: 'voice';
}

const SUGGESTIONS = [
  'What is Bookie?',
  'How does it work with Xero and Business Central?',
  'Is my data safe?',
  'What does it cost?',
  'How do I book a demo?',
];

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

/**
 * The public helper's panel: text chat, an optional voice call and the
 * standing notice that it can't see anyone's accounts. Loaded only when the
 * visitor opens it.
 */
export function PublicBookiePanel({
  open,
  voiceAvailable,
  onClose,
}: {
  open: boolean;
  voiceAvailable: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const turnstileResolve = useRef<((token: string) => void) | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const noticeId = useId();

  // Turnstile: show Cloudflare's check in the panel and resolve with its token.
  const renderTurnstile = useCallback(
    (siteKey: string) =>
      new Promise<string>((resolve) => {
        turnstileResolve.current = resolve;
        setTurnstileSiteKey(siteKey);
      }),
    []
  );
  useEffect(() => {
    if (!turnstileSiteKey || !turnstileBox.current) return;
    const el = turnstileBox.current;
    let widget: string | undefined;
    const mount = () => {
      widget = window.turnstile?.render(el, {
        sitekey: turnstileSiteKey,
        theme: 'dark',
        callback: (token: string) => {
          turnstileResolve.current?.(token);
          setTurnstileSiteKey(null);
        },
      });
    };
    if (window.turnstile) mount();
    else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = mount;
      document.head.appendChild(script);
    }
    return () => {
      if (widget) window.turnstile?.remove(widget);
    };
  }, [turnstileSiteKey]);

  const getPass = useCallback(() => fetchPass(renderTurnstile), [renderTurnstile]);

  // Start the check as soon as the panel opens, so it's done before the first question.
  useEffect(() => {
    if (open) getPass().catch(() => undefined);
  }, [open, getPass]);

  const addCaption = useCallback((text: string) => {
    setMessages((m) => [...m, { role: 'assistant', content: text, via: 'voice' }]);
  }, []);
  const voice = usePublicVoice(getPass, addCaption);
  const { stop: stopVoice } = voice;

  useEffect(() => {
    if (!open) {
      stopVoice();
      return;
    }
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, stopVoice]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  }, [messages, busy]);

  const textTurns = messages.filter((m) => !m.via);
  const atLimit = textTurns.length >= PUBLIC_LIMITS.maxMessages - 1;

  const send = async (raw: string) => {
    const question = raw.trim().slice(0, PUBLIC_LIMITS.maxMessageChars);
    if (!question || busy || atLimit) return;
    const history = [...textTurns, { role: 'user' as const, content: question }];
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setInput('');
    setBusy(true);
    setError(null);
    try {
      const ask = async () =>
        fetch('/api/public/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-bookie-pass': await getPass() },
          body: JSON.stringify({
            messages: history.map(({ role, content, sig }) => ({ role, content, sig })),
          }),
        });
      let res = await ask();
      if (res.status === 401) {
        clearPass();
        res = await ask();
      }
      const body = (await res.json().catch(() => ({}))) as {
        reply?: string;
        sig?: string;
        error?: string;
      };
      if (!res.ok || !body.reply)
        throw new Error(body.error ?? 'Bookie could not answer just now.');
      setMessages((m) => [...m, { role: 'assistant', content: body.reply!, sig: body.sig }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bookie could not answer just now.');
    } finally {
      setBusy(false);
    }
  };

  const live = voice.state === 'live' || voice.state === 'connecting';
  const left = voice.secondsLeft;

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={noticeId}
      data-testid="public-bookie-panel"
      hidden={!open}
      className="bg-canvas border-line-strong fixed inset-x-2 bottom-2 z-50 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-2xl border shadow-2xl motion-safe:transition-transform sm:inset-x-auto sm:right-5 sm:bottom-5 sm:h-[min(640px,calc(100dvh-2.5rem))] sm:w-[400px]"
    >
      <header className="border-line flex items-center gap-3 border-b px-4 py-3">
        <BookieAvatar
          className={cn(
            'h-10 w-10',
            voice.speaking && 'ring-brand ring-2 motion-safe:animate-pulse'
          )}
        />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-ink font-semibold">
            Bookie
          </h2>
          <p className="text-muted truncate text-xs">Public helper · questions about Bookie</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              stopVoice();
              setMessages([]);
              setError(null);
            }}
            className="text-muted hover:text-ink rounded-md p-2"
            aria-label="New conversation"
            title="New conversation"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="text-muted hover:text-ink rounded-md p-2"
          aria-label="Close Bookie"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <p
        id={noticeId}
        data-testid="public-bookie-notice"
        className="border-line bg-surface/60 text-body flex gap-2 border-b px-4 py-2.5 text-xs leading-relaxed"
      >
        <Info className="text-brand mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{PUBLIC_NOTICE}</span>
      </p>

      {voiceAvailable && (
        <div className="border-line flex items-center gap-2 border-b px-4 py-2.5">
          {live ? (
            <>
              <span
                className="text-brand-bright flex items-center gap-2 text-sm font-medium"
                role="status"
              >
                <span
                  className="bg-brand h-2 w-2 rounded-full motion-safe:animate-pulse"
                  aria-hidden="true"
                />
                {voice.state === 'connecting'
                  ? 'Calling Bookie…'
                  : voice.speaking
                    ? 'Bookie is speaking'
                    : 'Listening'}
              </span>
              {left !== null && (
                <span className="text-muted num text-xs" aria-label={`${left} seconds left`}>
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
                </span>
              )}
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={voice.toggleMute}
                  className="bg-surface-2 text-ink hover:bg-surface-3 rounded-full p-2"
                  aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
                  aria-pressed={voice.muted}
                >
                  {voice.muted ? (
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={voice.stop}
                  className="bg-danger/90 rounded-full p-2 text-white hover:bg-red-500"
                  aria-label="Hang up"
                >
                  <PhoneOff className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={voice.start}
                className="bg-brand/10 text-brand-bright border-brand/40 hover:bg-brand/20 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium"
                data-testid="public-bookie-call"
              >
                <Mic className="h-4 w-4" aria-hidden="true" /> Talk to Bookie
              </button>
              <span className="text-muted text-xs">
                Voice call, up to {PUBLIC_LIMITS.voiceMaxSeconds / 60} minutes
              </span>
            </>
          )}
        </div>
      )}
      {voice.error && (
        <p className="text-danger px-4 pt-2 text-xs" role="alert">
          {voice.error}
        </p>
      )}

      <div
        ref={scroller}
        role="log"
        aria-live="polite"
        aria-label="Conversation with Bookie"
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
      >
        {messages.length === 0 && (
          <div className="text-center">
            <BookieAvatar size="lg" className="mx-auto h-16 w-16" />
            <p className="text-ink mt-3 font-semibold">Hello, I’m Bookie.</p>
            <p className="text-muted mx-auto mt-1 max-w-xs text-sm">
              Ask me how Bookie works with Xero and Business Central, about security, installing it
              or booking a demo.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="bg-surface border-line text-body hover:border-brand/50 hover:text-ink rounded-full border px-3 py-1.5 text-left text-xs transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="bg-brand/15 text-ink border-brand/25 max-w-[85%] rounded-2xl rounded-br-md border px-3.5 py-2 text-sm break-words whitespace-pre-wrap">
                <span className="sr-only">You: </span>
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex gap-2.5" data-testid="public-bookie-reply">
              <BookieAvatar className="mt-0.5 h-7 w-7 shrink-0" />
              <div className="bg-surface border-line text-body max-w-[88%] rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-sm break-words">
                <span className="sr-only">Bookie{m.via ? ' (spoken)' : ''}: </span>
                <ReplyText text={m.content} />
              </div>
            </div>
          )
        )}
        {busy && (
          <p className="text-muted flex items-center gap-2 text-sm" role="status">
            <BookieAvatar className="h-7 w-7" />
            Bookie is typing…
          </p>
        )}
        {error && (
          <p className="text-danger text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      {turnstileSiteKey && (
        <div className="border-line flex justify-center border-t px-4 py-3" ref={turnstileBox} />
      )}

      <form
        className="border-line border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        {atLimit ? (
          <p className="text-muted px-1 py-2 text-sm">
            This conversation has reached its limit. Start a new one with the{' '}
            <RotateCcw className="inline h-3.5 w-3.5" aria-label="New conversation" /> button.
          </p>
        ) : (
          <div className="bg-surface border-line-strong focus-within:border-brand/60 flex items-end gap-2 rounded-xl border p-1.5">
            <label htmlFor={`${titleId}-input`} className="sr-only">
              Ask Bookie about the product
            </label>
            <textarea
              id={`${titleId}-input`}
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={PUBLIC_LIMITS.maxMessageChars}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder="Ask about Bookie…"
              className="text-ink placeholder:text-faint max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              data-testid="public-bookie-input"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-brand text-brand-ink hover:bg-brand-bright rounded-lg p-2 disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
        {input.length > PUBLIC_LIMITS.maxMessageChars - 100 && (
          <p className="text-muted mt-1 px-1 text-right text-xs" aria-live="polite">
            {PUBLIC_LIMITS.maxMessageChars - input.length} characters left
          </p>
        )}
      </form>
    </section>
  );
}
