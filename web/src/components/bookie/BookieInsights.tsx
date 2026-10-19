'use client';

import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RotateCcw } from 'lucide-react';
import type { BookieSuggestion } from '@/lib/bookie/suggestion-types';
import { BookieAvatar } from './BookieAvatar';
import { BookieSuggestions } from './BookieSuggestions';

type State =
  | { kind: 'loading'; status: string }
  | { kind: 'ready'; text: string; at: string; suggestions?: BookieSuggestion[] }
  | { kind: 'error'; message: string }
  | { kind: 'off' };

/** Bookie's take is kept for this browser session only; nothing is stored on the server. */
const cacheKey = (orgKey: string) =>
  `bookie:take:${orgKey}:${new Date().toISOString().slice(0, 10)}`;

/**
 * "Bookie's take" on Home: three short points from Bookie, worked out live from
 * the organisation's books with the same read-only tools as the chat.
 */
export function BookieInsights({ orgKey }: { orgKey: string }) {
  const [state, setState] = useState<State>({
    kind: 'loading',
    status: 'Bookie is reading the books…',
  });

  const load = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = sessionStorage.getItem(cacheKey(orgKey));
        if (cached) {
          setState(JSON.parse(cached) as State);
          return;
        }
      }
      setState({ kind: 'loading', status: 'Bookie is reading the books…' });
      try {
        const response = await fetch('/api/bookie/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgKey, mode: 'insights' }),
        });
        if (response.status === 503) return setState({ kind: 'off' });
        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'Bookie could not look just now.');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          for (const raw of events) {
            const line = raw.replace(/^data: /, '');
            if (!line) continue;
            const event = JSON.parse(line) as {
              type: string;
              text: string;
              suggestions?: BookieSuggestion[];
            };
            if (event.type === 'status') setState({ kind: 'loading', status: event.text });
            if (event.type === 'error') throw new Error(event.text);
            if (event.type === 'message') {
              const ready: State = {
                kind: 'ready',
                text: event.text,
                suggestions: event.suggestions ?? [],
                at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              };
              sessionStorage.setItem(cacheKey(orgKey), JSON.stringify(ready));
              setState(ready);
            }
          }
        }
      } catch (error) {
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Bookie could not look just now.',
        });
      }
    },
    [orgKey]
  );

  useEffect(() => {
    // Deferred a tick so the first render stays pure.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (state.kind === 'off') return null;

  return (
    <section
      aria-labelledby="bookie-take"
      aria-busy={state.kind === 'loading'}
      className="card from-brand/10 via-surface to-surface relative overflow-hidden bg-gradient-to-br px-5 py-4"
      data-testid="bookie-take"
    >
      <div className="flex items-start gap-3">
        <BookieAvatar className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 id="bookie-take" className="text-ink text-[15px] font-semibold">
              Bookie&rsquo;s take
            </h2>
            {state.kind !== 'loading' && (
              <button
                type="button"
                onClick={() => void load(true)}
                className="text-muted hover:text-ink flex items-center gap-1.5 text-xs"
                aria-label="Ask Bookie again"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {state.kind === 'ready' ? `As of ${state.at}` : 'Try again'}
              </button>
            )}
          </div>
          {state.kind === 'loading' && (
            <p className="text-muted mt-1 animate-pulse text-sm">{state.status}</p>
          )}
          {state.kind === 'error' && <p className="text-muted mt-1 text-sm">{state.message}</p>}
          {state.kind === 'ready' && (
            <>
              <div className="bookie-md text-body mt-1.5 text-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{state.text}</ReactMarkdown>
              </div>
              {state.suggestions?.length ? (
                <div className="mt-3">
                  <h3 className="text-muted mb-1.5 text-xs font-medium tracking-wide uppercase">
                    Suggested next steps
                  </h3>
                  <BookieSuggestions orgKey={orgKey} suggestions={state.suggestions} />
                </div>
              ) : null}
            </>
          )}
          <p className="text-faint mt-2 text-[11px]">
            Worked out live from your books. Check important figures.
          </p>
        </div>
      </div>
    </section>
  );
}
