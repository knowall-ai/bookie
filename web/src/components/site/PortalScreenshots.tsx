'use client';

import Image, { type StaticImageData } from 'next/image';
import { useState } from 'react';
import { cn } from '@/lib/ui/cn';
import home from '../../../public/screenshots/home.webp';
import invoices from '../../../public/screenshots/sales-invoices.webp';
import invoice from '../../../public/screenshots/invoice-detail.webp';
import bills from '../../../public/screenshots/purchases-bills.webp';
import contact from '../../../public/screenshots/contact-detail.webp';
import profitAndLoss from '../../../public/screenshots/profit-and-loss.webp';
import aged from '../../../public/screenshots/aged-receivables.webp';
import askBookie from '../../../public/screenshots/ask-bookie.webp';

/** Real portal screenshots, taken from Microsoft's CRONUS sample company (see docs/images/screenshots). */
const SHOTS: { id: string; label: string; path: string; alt: string; src: StaticImageData }[] = [
  {
    id: 'home',
    label: 'Home',
    path: 'portal',
    alt: 'Bookie Home dashboard with the activity chart, bank accounts and invoices owed',
    src: home,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    path: 'portal/sales/invoices',
    alt: 'Sales invoices list with status tabs, due dates, amounts paid and due',
    src: invoices,
  },
  {
    id: 'invoice',
    label: 'Invoice',
    path: 'portal/sales/invoices/103296',
    alt: 'A paid sales invoice with its line, totals, payments and attachments',
    src: invoice,
  },
  {
    id: 'bills',
    label: 'Bills',
    path: 'portal/purchases/bills',
    alt: 'Purchases bills list with overdue, draft and paid bills',
    src: bills,
  },
  {
    id: 'contact',
    label: 'Contact',
    path: 'portal/contacts',
    alt: 'A customer contact with what they owe, what is overdue and their latest invoices',
    src: contact,
  },
  {
    id: 'pnl',
    label: 'Profit and loss',
    path: 'portal/reporting/profit-and-loss',
    alt: 'Profit and loss report for a financial year, with CSV export and print',
    src: profitAndLoss,
  },
  {
    id: 'aged',
    label: 'Aged receivables',
    path: 'portal/reporting/aged-receivables',
    alt: 'Aged receivables summary by customer and overdue bucket',
    src: aged,
  },
  {
    id: 'bookie',
    label: 'Ask Bookie',
    path: 'portal',
    alt: 'Ask Bookie panel answering who owes the most and how late they are',
    src: askBookie,
  },
];

export function PortalScreenshots() {
  const [active, setActive] = useState(SHOTS[0].id);
  const shot = SHOTS.find((s) => s.id === active) ?? SHOTS[0];

  return (
    <div id="screenshots" className="mt-12">
      <div
        role="tablist"
        aria-label="Portal screens"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      >
        {SHOTS.map((s) => (
          <button
            key={s.id}
            id={`shot-tab-${s.id}`}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            aria-controls="shot-panel"
            onClick={() => setActive(s.id)}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors',
              s.id === active
                ? 'border-brand/50 bg-brand/10 text-brand-bright'
                : 'border-line text-muted hover:text-ink hover:border-line-strong'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <figure
        id="shot-panel"
        role="tabpanel"
        aria-labelledby={`shot-tab-${shot.id}`}
        className="border-line-strong bg-surface/60 mt-4 overflow-hidden rounded-(--radius-card) border"
      >
        <div className="border-line flex items-center gap-2 border-b px-4 py-3" aria-hidden="true">
          <span className="bg-line-strong h-2.5 w-2.5 rounded-full" />
          <span className="bg-line-strong h-2.5 w-2.5 rounded-full" />
          <span className="bg-line-strong h-2.5 w-2.5 rounded-full" />
          <span className="bg-night text-faint ml-4 truncate rounded-md px-3 py-1 text-xs">
            getbook.ie/{shot.path}
          </span>
        </div>
        <Image
          key={shot.id}
          src={shot.src}
          alt={shot.alt}
          placeholder="blur"
          sizes="(min-width: 1280px) 1200px, 100vw"
          className="block h-auto w-full"
        />
      </figure>
      <p className="text-faint mt-4 text-center text-sm">
        Shown with Microsoft&rsquo;s CRONUS sample company in Business Central.
      </p>
    </div>
  );
}
