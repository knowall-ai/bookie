'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Mic, MicOff, PhoneOff, RotateCcw, Users, X } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { BookieAvatar } from './BookieAvatar';
import { useBookieVoice } from './useBookieVoice';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  via?: 'voice';
}

const SUGGESTIONS = [
  'How is cash looking?',
  'Who owes us the most, and how late are they?',
  'Which bills are due in the next two weeks?',
  'Summarise profit and loss for this financial year.',
];

function storageKey(orgKey?: string) {
  return `bookie:chat:${orgKey ?? 'none'}`;
}

/** Reads Bookie's server-sent events. */
async function askBookie(
  orgKey: string | undefined,
  messages: Message[],
  onStatus: (text: string) => void
): Promise<string> {
  const response = await fetch('/api/bookie/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgKey,
      messages: messages.map(({ role, content }) => ({ role, content })),
    }),
  });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Bookie could not answer just now.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const raw of events) {
      const line = raw.replace(/^data: /, '');
      if (!line) continue;
      const event = JSON.parse(line) as { type: string; text: string };
      if (event.type === 'status') onStatus(event.text);
      if (event.type === 'message') answer = event.text;
      if (event.type === 'error') throw new Error(event.text);
    }
  }
  return answer;
}

export function BookiePanel({
  orgKey,
  orgName,
  onClose,
}: {
  orgKey?: string;
  orgName?: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(sessionStorage.getItem(storageKey(orgKey)) ?? '[]') as Message[];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  // "Call on Teams" calls the agent set up in Settings › Email; no agent, no button.
  const [teamsUser, setTeamsUser] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/bookie/agent')
      .then((r) => (r.ok ? r.json() : { agent: null }))
      .then((body: { agent?: { teamsUser?: string } | null }) => {
        if (!cancelled) setTeamsUser(body.agent?.teamsUser ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const addTranscript = useCallback((role: 'assistant' | 'user', text: string) => {
    setMessages((m) => [...m, { role, content: text, via: 'voice' }]);
  }, []);
  const voice = useBookieVoice(orgKey, addTranscript);

  useEffect(() => {
    sessionStorage.setItem(storageKey(orgKey), JSON.stringify(messages.slice(-40)));
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, orgKey, status]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { stop: stopVoice } = voice;
  useEffect(() => () => stopVoice(), [stopVoice]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: 'user' as const, content: question }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError(null);
    setStatus('Thinking…');
    try {
      const answer = await askBookie(
        orgKey,
        next.filter((m) => !m.via),
        setStatus
      );
      setMessages((m) => [...m, { role: 'assistant', content: answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bookie could not answer just now.');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const live = voice.state === 'live' || voice.state === 'connecting';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ask Bookie"
        data-testid="bookie-panel"
        className="bg-canvas border-line flex h-full w-full max-w-[440px] flex-col border-l shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-line flex items-center gap-3 border-b px-4 py-3">
          <BookieAvatar className={cn('h-11 w-11', voice.speaking && 'ring-brand ring-2')} />
          <div className="min-w-0 flex-1">
            <h2 className="text-ink font-semibold">Bookie</h2>
            <p className="text-muted truncate text-xs">
              Your AI bookkeeper{orgName ? ` · ${orgName}` : ''}
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="text-muted hover:text-ink p-2"
              aria-label="New conversation"
              title="New conversation"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink p-2"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-line flex items-center gap-2 border-b px-4 py-2.5">
          {live ? (
            <>
              <span className="text-brand-bright flex items-center gap-2 text-sm font-medium">
                <span className="bg-brand h-2 w-2 animate-pulse rounded-full" />
                {voice.state === 'connecting'
                  ? 'Calling Bookie…'
                  : voice.speaking
                    ? 'Bookie is speaking'
                    : 'Listening'}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={voice.toggleMute}
                  className="bg-surface-2 text-ink hover:bg-surface-3 rounded-full p-2"
                  aria-label={voice.muted ? 'Unmute' : 'Mute'}
                >
                  {voice.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={voice.stop}
                  className="bg-danger/90 rounded-full p-2 text-white hover:bg-red-500"
                  aria-label="Hang up"
                >
                  <PhoneOff className="h-4 w-4" />
                </button>
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={voice.start}
                disabled={!orgKey}
                className="bg-brand/10 text-brand-bright border-brand/40 hover:bg-brand/20 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                data-testid="bookie-talk"
              >
                <Mic className="h-4 w-4" /> Talk to Bookie
              </button>
              {teamsUser && (
                <a
                  href={`https://teams.microsoft.com/l/call/0/0?users=${encodeURIComponent(teamsUser)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-surface-2 text-body border-line-strong hover:text-ink flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                >
                  <Users className="h-4 w-4" /> Call on Teams
                </a>
              )}
            </>
          )}
        </div>
        {voice.error && <p className="text-danger px-4 pt-2 text-xs">{voice.error}</p>}

        <div
          ref={scroller}
          className="flex-1 space-y-4 overflow-y-auto px-4 py-5"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="text-center">
              <BookieAvatar className="mx-auto h-20 w-20" />
              <p className="text-ink mt-4 font-semibold">Hello, I’m Bookie.</p>
              <p className="text-muted mx-auto mt-1 max-w-xs text-sm">
                {orgKey
                  ? `Ask me anything about ${orgName ?? 'these books'}. I look things up live and never change your accounts without you.`
                  : 'Open an organisation and I can look into its books for you.'}
              </p>
              {orgKey && (
                <div className="mt-5 flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="bg-surface border-line text-body hover:border-brand/50 hover:text-ink rounded-xl border px-3 py-2 text-left text-sm transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <p className="bg-brand/15 text-ink border-brand/25 max-w-[85%] rounded-2xl rounded-br-md border px-3.5 py-2 text-sm whitespace-pre-wrap">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={i} className="flex gap-2.5">
                <BookieAvatar className="mt-0.5 h-7 w-7 shrink-0" />
                <div className="bookie-md bg-surface border-line text-body max-w-[88%] rounded-2xl rounded-tl-md border px-3.5 py-2.5 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  {m.via === 'voice' && (
                    <p className="text-faint mt-1 text-[10px] tracking-wide uppercase">Spoken</p>
                  )}
                </div>
              </div>
            )
          )}
          {status && (
            <div className="text-muted flex items-center gap-2 text-sm">
              <BookieAvatar className="h-7 w-7" />
              <span className="animate-pulse">{status}</span>
            </div>
          )}
          {error && (
            <p className="bg-danger/10 text-danger border-danger/30 rounded-lg border px-3 py-2 text-sm">
              {error}
            </p>
          )}
        </div>

        <form
          className="border-line border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <div className="bg-surface border-line-strong focus-within:border-brand flex items-end gap-2 rounded-2xl border p-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={orgKey ? 'Ask Bookie about your books…' : 'Open an organisation first'}
              aria-label="Message Bookie"
              className="text-ink placeholder:text-faint max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              data-testid="bookie-input"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="bg-brand text-brand-ink hover:bg-brand-bright flex h-9 w-9 shrink-0 items-center justify-center rounded-xl disabled:opacity-40"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="text-faint mt-2 px-1 text-[11px]">
            Bookie reads your books live and can make mistakes. Check important figures. Not tax or
            legal advice.
          </p>
        </form>
      </aside>
    </div>
  );
}
