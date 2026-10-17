import Link from 'next/link';
import { Suspense } from 'react';
import { FileMinus } from 'lucide-react';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { CreditNote, CreditNoteType } from '@/lib/domain/types';
import { formatDate, formatMoney } from '@/lib/ui/format';
import { Money } from '@/components/ui/Money';

const PATH: Record<CreditNoteType, string> = {
  sales: '/sales/credit-notes',
  purchase: '/purchases/credit-notes',
};

/** Approved credit notes for a contact with credit the source says is still unallocated. */
export async function unallocatedCredit(
  connector: AccountingConnector,
  contactId: string,
  type: CreditNoteType,
  currency?: string
): Promise<CreditNote[]> {
  if (!connector.creditNotes) return [];
  const page = await connector.creditNotes
    .list(type, { contactId, status: 'authorised', pageSize: 50 })
    .catch(() => undefined);
  return (page?.items ?? []).filter(
    (c) =>
      c.contact.id === contactId &&
      c.status === 'authorised' &&
      // Only the source's own remaining figure counts: unknown is never shown as credit.
      typeof c.remainingCredit === 'number' &&
      c.remainingCredit > 0 &&
      (!currency || c.currency === currency)
  );
}

/**
 * "This contact has £X unallocated credit" with an Allocate link per credit note.
 * On an invoice page pass `invoiceId` so the link preselects it.
 */
export function AvailableCredit(props: {
  connector: AccountingConnector;
  base: string;
  contactId: string;
  type: CreditNoteType;
  invoiceId?: string;
  currency?: string;
}) {
  if (!props.connector.creditNotes?.allocate) return null;
  return (
    <Suspense fallback={null}>
      <AvailableCreditInner {...props} />
    </Suspense>
  );
}

async function AvailableCreditInner({
  connector,
  base,
  contactId,
  type,
  invoiceId,
  currency,
}: {
  connector: AccountingConnector;
  base: string;
  contactId: string;
  type: CreditNoteType;
  invoiceId?: string;
  currency?: string;
}) {
  const notes = await unallocatedCredit(connector, contactId, type, currency);
  if (notes.length === 0) return null;
  // Sum per currency so mixed-currency credit is never added together.
  const byCurrency = new Map<string, number>();
  for (const n of notes)
    byCurrency.set(n.currency, (byCurrency.get(n.currency) ?? 0) + (n.remainingCredit ?? 0));
  const total = [...byCurrency].map(([cur, amount]) => formatMoney(amount, cur)).join(' + ');
  const noun = type === 'sales' ? 'credit note' : 'supplier credit note';
  return (
    <section
      aria-labelledby={`credit-${type}`}
      className="card border-info/30 bg-info/5 p-5"
      data-testid="available-credit"
    >
      <h2 id={`credit-${type}`} className="text-ink flex items-center gap-2 text-sm font-semibold">
        <FileMinus className="text-info h-4 w-4" />
        {type === 'sales' ? 'This contact has' : 'You have'} {total} unallocated credit
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {notes.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`${base}${PATH[type]}/${encodeURIComponent(n.id)}`}
              className="text-body hover:text-brand-bright"
            >
              {n.number || noun} · {formatDate(n.date)}
              {n.reference ? ` · ${n.reference}` : ''}
            </Link>
            <span className="flex items-center gap-3">
              <Money amount={n.remainingCredit} currency={n.currency} className="text-ink" />
              <Link
                href={`${base}${PATH[type]}/${encodeURIComponent(n.id)}${invoiceId ? `?allocate=${encodeURIComponent(invoiceId)}` : ''}#allocate`}
                className="text-brand-bright font-medium hover:underline"
              >
                Allocate
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
