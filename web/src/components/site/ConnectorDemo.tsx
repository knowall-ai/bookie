'use client';

import { useState } from 'react';
import { cn } from '@/lib/ui/cn';

type Source = 'xero' | 'bc';

const SOURCES: { id: Source; label: string; note: string }[] = [
  { id: 'xero', label: 'Xero', note: 'Read live from the Xero accounting API, as you.' },
  {
    id: 'bc',
    label: 'Business Central',
    note: 'Read live from the Business Central API, with your own Business Central licence and permissions.',
  },
];

/** Fictional invoices: the same rows whichever back end they come from. */
const ROWS = [
  {
    no: 'INV-0412',
    to: 'Northwind Traders',
    due: '24 Oct',
    amount: '1,840.00',
    status: 'Awaiting payment',
  },
  {
    no: 'INV-0411',
    to: 'Fabrikam Joinery Ltd',
    due: '18 Oct',
    amount: '612.50',
    status: 'Overdue',
  },
  { no: 'INV-0410', to: 'Wingtip Studio', due: '10 Oct', amount: '2,300.00', status: 'Paid' },
];

const statusTone: Record<string, string> = {
  'Awaiting payment': 'text-info',
  Overdue: 'text-danger',
  Paid: 'text-brand-bright',
};

export function ConnectorDemo() {
  const [source, setSource] = useState<Source>('xero');
  const active = SOURCES.find((s) => s.id === source)!;

  return (
    <div className="w-full min-w-0">
      <div
        role="radiogroup"
        aria-label="Accounting system"
        className="border-line-strong bg-night inline-flex rounded-full border p-1"
      >
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={source === s.id}
            onClick={() => setSource(s.id)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              source === s.id ? 'bg-brand text-brand-ink' : 'text-muted hover:text-ink'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="card mt-5 overflow-hidden p-0">
        <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
          <span className="text-ink text-sm font-semibold">Sales invoices</span>
          <span className="text-faint text-xs">
            Illustration: fictional Contoso Coffee Roasters Ltd
          </span>
        </div>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Example invoices">
          <table className="w-full min-w-[460px] text-sm whitespace-nowrap">
            <caption className="sr-only">
              Illustration with fictional invoices, as they would be read from {active.label}
            </caption>
            <thead>
              <tr className="text-faint border-line border-b text-left text-xs">
                <th scope="col" className="px-3.5 py-2 font-medium">
                  Number
                </th>
                <th scope="col" className="px-3.5 py-2 font-medium">
                  To
                </th>
                <th scope="col" className="px-3.5 py-2 font-medium">
                  Due date
                </th>
                <th scope="col" className="px-3.5 py-2 text-right font-medium">
                  Due (£)
                </th>
                <th scope="col" className="px-3.5 py-2 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.no} className="border-line/60 border-b last:border-0">
                  <td className="text-ink px-3.5 py-2.5">{r.no}</td>
                  <td className="text-body px-3.5 py-2.5">{r.to}</td>
                  <td className="text-body px-3.5 py-2.5">{r.due}</td>
                  <td className="num text-ink px-3.5 py-2.5 text-right">{r.amount}</td>
                  <td className={cn('px-3.5 py-2.5', statusTone[r.status])}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p
          aria-live="polite"
          className="border-line bg-surface-2 text-muted border-t px-3.5 py-2.5 text-xs"
        >
          <span className="text-brand-bright font-medium">{active.label}.</span> {active.note}
        </p>
      </div>
    </div>
  );
}
