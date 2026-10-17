import Link from 'next/link';
import { cn } from '@/lib/ui/cn';

export interface StatusTab {
  value: string;
  label: string;
  count?: number;
}

/** Xero-style status tabs ("All · Draft · Awaiting payment · Paid"), driven by `?status=`. */
export function StatusTabs({
  tabs,
  current,
  basePath,
  params = {},
}: {
  tabs: StatusTab[];
  current: string;
  basePath: string;
  params?: Record<string, string | undefined>;
}) {
  return (
    <div role="tablist" className="border-line mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const query = new URLSearchParams(
          Object.entries({
            ...params,
            status: tab.value === 'all' ? undefined : tab.value,
            page: undefined,
          }).filter((e): e is [string, string] => !!e[1])
        );
        const active = current === tab.value;
        return (
          <Link
            key={tab.value}
            role="tab"
            aria-selected={active}
            href={`${basePath}${query.size ? `?${query}` : ''}`}
            className={cn(
              '-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
              active
                ? 'border-brand text-ink font-semibold'
                : 'text-muted hover:text-ink border-transparent'
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="text-faint ml-1.5">({tab.count})</span>}
          </Link>
        );
      })}
    </div>
  );
}
