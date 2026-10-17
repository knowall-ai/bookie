'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cn } from '@/lib/ui/cn';

/** The global search box: focused on arrival, debounced, writes `?q=`. */
export function SearchForm({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const last = useRef(initial);

  const go = (q: string) => {
    const term = q.trim();
    if (term === last.current) return;
    last.current = term;
    startTransition(() =>
      router.replace(term ? `${pathname}?q=${encodeURIComponent(term)}` : pathname)
    );
  };

  useEffect(() => {
    const timer = setTimeout(() => go(value), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
      className="relative"
    >
      <label htmlFor="global-search" className="sr-only">
        Search contacts, invoices, bills and quotes
      </label>
      <Search
        aria-hidden="true"
        className={cn(
          'text-faint pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2',
          pending && 'animate-pulse'
        )}
      />
      <input
        id="global-search"
        type="search"
        autoFocus
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search contacts, invoices, bills and quotes"
        className="bg-surface border-line-strong text-ink placeholder:text-faint focus:border-brand h-12 w-full rounded-xl border pr-4 pl-12 text-base outline-none"
      />
    </form>
  );
}
