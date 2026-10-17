import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/ui/cn';

/** Fictional organisations, drawn as the portal's organisation menu. */
const ORGS = [
  { name: 'Contoso Coffee Roasters Ltd', source: 'Xero', initials: 'CC', current: true },
  { name: 'Fabrikam Joinery Ltd', source: 'Business Central', initials: 'FJ' },
  { name: 'Northwind Traders', source: 'Xero', initials: 'NT' },
  { name: 'Tailspin Toys Ireland DAC', source: 'Business Central', initials: 'TT' },
  { name: 'Wingtip Studio', source: 'Xero', initials: 'WS' },
];

export function OrgSwitcherMock() {
  return (
    <figure className="relative mx-auto w-full max-w-md" aria-label="Example organisation menu">
      <div
        aria-hidden="true"
        className="bg-brand/15 absolute -inset-8 -z-10 rounded-full blur-3xl"
      />
      <div className="card overflow-hidden p-0" aria-hidden="true">
        <div className="border-line bg-surface-2 flex items-center gap-3 border-b px-4 py-3">
          <span className="bg-brand text-brand-ink inline-flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold">
            CC
          </span>
          <span className="text-ink flex-1 truncate text-sm font-semibold">
            Contoso Coffee Roasters Ltd
          </span>
          <ChevronDown className="text-muted h-4 w-4" />
        </div>
        <div className="p-3">
          <div className="border-line-strong bg-night/60 text-faint flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <Search className="h-4 w-4" />
            Search organisations
          </div>
          <ul className="mt-2">
            {ORGS.map((o) => (
              <li
                key={o.name}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2.5',
                  o.current && 'bg-brand/10'
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold',
                    o.current ? 'bg-brand text-brand-ink' : 'bg-surface-3 text-body'
                  )}
                >
                  {o.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm">{o.name}</span>
                  <span className="text-faint block text-xs">{o.source}</span>
                </span>
                {o.current && <Check className="text-brand-bright h-4 w-4" />}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="text-faint mt-4 text-center text-xs">
        Fictional organisations. One sign-in, every set of books you have access to.
      </figcaption>
    </figure>
  );
}
