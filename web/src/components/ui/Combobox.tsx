'use client';

import { Loader2, Search } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { cn } from '@/lib/ui/cn';
import { inputClass } from './Field';

export type ComboboxSearch<T> = (
  query: string
) => Promise<{ ok: true; data: T[] } | { ok: false; error: string }>;

/**
 * A search-as-you-type combobox (WAI-ARIA combobox with a listbox popup).
 * Debounced; searches only from `minChars`; ignores answers to older queries.
 * Keyboard: Down/Up move, Home/End jump, Enter picks, Escape closes and then clears.
 */
export function Combobox<T>({
  label,
  placeholder,
  search,
  getKey,
  renderOption,
  onSelect,
  minChars = 2,
  debounceMs = 300,
  disabled,
  emptyText = 'No matches.',
  testId,
}: {
  label: string;
  placeholder?: string;
  search: ComboboxSearch<T>;
  getKey: (item: T) => string;
  renderOption: (item: T) => React.ReactNode;
  /** Called with the picked item. Return `true` to clear the box afterwards. */
  onSelect: (item: T) => void | boolean | Promise<void | boolean>;
  minChars?: number;
  debounceMs?: number;
  disabled?: boolean;
  emptyText?: string;
  testId?: string;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /** The latest answer, for the query it answered. */
  const [answer, setAnswer] = useState<{ query: string; items: T[]; error?: string } | null>(null);
  const seq = useRef(0);
  const runSearch = useEffectEvent((q: string) => search(q));

  const trimmed = query.trim();
  const tooShort = trimmed.length < minChars;
  const current = !tooShort && answer?.query === trimmed ? answer : null;
  const items = current?.items ?? [];
  const state: 'idle' | 'loading' | 'done' | 'error' = tooShort
    ? 'idle'
    : !current
      ? 'loading'
      : current.error
        ? 'error'
        : 'done';

  useEffect(() => {
    const mine = ++seq.current;
    if (tooShort) return;
    const timer = setTimeout(async () => {
      const result = await runSearch(trimmed).catch(() => ({
        ok: false as const,
        error: 'Search failed. Try again.',
      }));
      if (mine !== seq.current) return;
      if (result.ok) {
        setAnswer({ query: trimmed, items: result.data });
        setActive(result.data.length ? 0 : -1);
      } else {
        setAnswer({ query: trimmed, items: [], error: result.error });
        setActive(-1);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [trimmed, tooShort, debounceMs]);

  const pick = async (item: T) => {
    const clear = await onSelect(item);
    if (clear) {
      setQuery('');
      setAnswer(null);
    }
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const last = items.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
        if (last >= 0) setActive((i) => (i >= last ? 0 : i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setOpen(true);
        if (last >= 0) setActive((i) => (i <= 0 ? last : i - 1));
        break;
      case 'Home':
        if (open && last >= 0) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open && last >= 0) {
          e.preventDefault();
          setActive(last);
        }
        break;
      case 'Enter':
        if (open && active >= 0 && items[active]) {
          e.preventDefault();
          void pick(items[active]);
        }
        break;
      case 'Escape':
        if (open) setOpen(false);
        else setQuery('');
        break;
    }
  };

  const status = tooShort
    ? trimmed
      ? `Type at least ${minChars} characters.`
      : ''
    : state === 'loading'
      ? 'Searching…'
      : state === 'error'
        ? (current?.error ?? '')
        : state === 'done' && items.length === 0
          ? emptyText
          : state === 'done'
            ? `${items.length} result${items.length === 1 ? '' : 's'}. Use the arrow keys to choose.`
            : '';
  const showPopup = open && !tooShort && state !== 'idle';

  return (
    <div className="relative" data-testid={testId}>
      <label htmlFor={`${id}-input`} className="text-body mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search
          aria-hidden="true"
          className="text-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
        />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showPopup}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPopup && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={`${id}-status`}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(inputClass, 'pr-9 pl-9')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {state === 'loading' && !tooShort && (
          <Loader2
            aria-hidden="true"
            className="text-faint absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin"
          />
        )}
      </div>
      <p id={`${id}-status`} className="sr-only" aria-live="polite">
        {status}
      </p>
      <div
        className={cn(
          'bg-surface border-line-strong absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border shadow-lg',
          !showPopup && 'hidden'
        )}
      >
        <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
          {items.map((item, i) => (
            <li
              key={getKey(item)}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn(
                'cursor-pointer px-3 py-2',
                i === active ? 'bg-surface-3' : 'hover:bg-surface-2'
              )}
              // Keep focus in the input so blur doesn't close the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => void pick(item)}
            >
              {renderOption(item)}
            </li>
          ))}
        </ul>
        {items.length === 0 && status && (
          <p
            data-testid="combobox-message"
            className={cn('px-3 py-2 text-sm', state === 'error' ? 'text-danger' : 'text-faint')}
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
}
