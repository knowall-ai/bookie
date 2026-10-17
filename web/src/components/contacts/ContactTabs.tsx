import Link from 'next/link';
import { cn } from '@/lib/ui/cn';

export type ContactTab = 'all' | 'customers' | 'suppliers' | 'archived';

export const CONTACT_TABS: { value: ContactTab; label: string; query: Record<string, string> }[] = [
  { value: 'all', label: 'All', query: {} },
  { value: 'customers', label: 'Customers', query: { role: 'customer' } },
  { value: 'suppliers', label: 'Suppliers', query: { role: 'supplier' } },
  { value: 'archived', label: 'Archived', query: { status: 'archived' } },
];

/** Which tab `?role=` / `?status=` select. Archived wins, as in Xero. */
export function contactTab(params: { role?: string; status?: string }): ContactTab {
  if (params.status === 'archived') return 'archived';
  if (params.role === 'customer') return 'customers';
  if (params.role === 'supplier') return 'suppliers';
  return 'all';
}

/** Xero's contact tabs: All contacts · Customers · Suppliers · Archived. */
export function ContactTabs({
  current,
  basePath,
  search,
}: {
  current: ContactTab;
  basePath: string;
  search?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Contact groups"
      className="border-line mb-4 flex gap-1 overflow-x-auto border-b"
    >
      {CONTACT_TABS.map((tab) => {
        const query = new URLSearchParams({ ...tab.query, ...(search ? { search } : {}) });
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
          </Link>
        );
      })}
    </div>
  );
}
