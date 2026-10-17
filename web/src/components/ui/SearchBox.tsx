'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { cn } from '@/lib/ui/cn';

/** Debounced search that writes `?search=` into the URL so results are shareable. */
export function SearchBox({
  placeholder = 'Search',
  className,
}: {
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('search') ?? '');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const current = params.get('search') ?? '';
    if (value === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (value) next.set('search', value);
      else next.delete('search');
      next.delete('page');
      startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ''}`));
    }, 350);
    return () => clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search
        className={cn(
          'text-faint pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2',
          pending && 'animate-pulse'
        )}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="bg-surface border-line-strong text-ink placeholder:text-faint focus:border-brand h-10 w-full rounded-lg border pr-3 pl-9 text-sm outline-none"
      />
    </label>
  );
}
