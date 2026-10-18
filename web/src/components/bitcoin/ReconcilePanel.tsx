import { Scale } from 'lucide-react';
import type { ReconcileView } from '@/lib/bitcoin/reconcile-service';
import type { MatchedTx } from '@/lib/bitcoin/reconcile';
import { shortTxid } from '@/lib/bitcoin/format';
import type { BtcLedgerEntry } from '@/lib/connectors/types';
import { formatDate } from '@/lib/ui/format';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { BtcAmount } from './BitcoinParts';
import { DraftBatches, DraftJournalForm } from './ReconcileActions';

const matchedColumns: Column<MatchedTx>[] = [
  {
    key: 'date',
    header: 'Date',
    cell: (m) => (m.tx.date ? formatDate(m.tx.date) : <Badge tone="amber">Pending</Badge>),
  },
  {
    key: 'txid',
    header: 'Transaction',
    cell: (m) => (
      <span className="font-mono text-xs" title={m.tx.txid}>
        {shortTxid(m.tx.txid)}
      </span>
    ),
  },
  {
    key: 'by',
    header: 'Matched by',
    cell: (m) => (
      <span className="flex flex-wrap gap-1.5">
        <Badge tone={m.by === 'txid' ? 'green' : 'blue'}>
          {m.by === 'txid' ? 'Txid' : 'Amount and date'}
        </Badge>
        {m.amountDiffers && <Badge tone="red">Amounts differ</Badge>}
      </span>
    ),
  },
  {
    key: 'books',
    header: 'In the books',
    hideOnMobile: true,
    cell: (m) => (
      <span className="text-muted text-xs">
        {m.entries
          .map((e) => `${formatDate(e.postingDate)} ${e.documentNumber ?? ''}`.trim())
          .join(', ')}
      </span>
    ),
  },
  {
    key: 'chain',
    header: 'On chain',
    align: 'right',
    cell: (m) => <BtcAmount sats={m.tx.netSats} sign />,
  },
  {
    key: 'ledger',
    header: 'In the books',
    align: 'right',
    cell: (m) => (
      <BtcAmount sats={m.ledgerSats} sign className={m.amountDiffers ? 'text-danger' : undefined} />
    ),
  },
];

const ledgerColumns: Column<BtcLedgerEntry>[] = [
  { key: 'date', header: 'Posting date', cell: (e) => formatDate(e.postingDate) },
  { key: 'doc', header: 'Document no.', cell: (e) => e.documentNumber ?? '' },
  {
    key: 'ext',
    header: 'External document no.',
    hideOnMobile: true,
    cell: (e) => <span className="font-mono text-xs">{e.externalDocumentNumber ?? ''}</span>,
  },
  { key: 'description', header: 'Description', cell: (e) => e.description ?? '' },
  {
    key: 'amount',
    header: 'Amount',
    align: 'right',
    cell: (e) => <BtcAmount sats={e.amountSats} sign colour />,
  },
];

function Tile({ label, value, testId }: { label: string; value: React.ReactNode; testId: string }) {
  return (
    <div className="card px-5 py-4" data-testid={testId}>
      <p className="text-faint text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="text-ink mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

/** Accounting › Bank accounts › a wallet › Reconcile. */
export function ReconcilePanel({
  view,
  orgKey,
  walletId,
  accounts,
}: {
  view: ReconcileView;
  orgKey: string;
  walletId: string;
  accounts: { code: string; name: string }[];
}) {
  if (view.status !== 'ok') {
    return (
      <div data-testid="reconcile-unavailable">
        <EmptyState
          icon={<Scale className="h-6 w-6" />}
          title="Can’t reconcile this wallet yet"
          body={view.reason}
        />
      </div>
    );
  }
  const { result, scan } = view;
  const drafted = new Set(view.drafted);
  const difference = scan.balance.confirmedSats - view.ledgerSats;

  return (
    <div data-testid="reconcile">
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="On chain (confirmed)"
          testId="rec-chain"
          value={<BtcAmount sats={scan.balance.confirmedSats} />}
        />
        <Tile
          label={`In the books (${view.bankAccountNumber})`}
          testId="rec-books"
          value={<BtcAmount sats={view.ledgerSats} />}
        />
        <Tile
          label="Difference"
          testId="rec-difference"
          value={
            <BtcAmount
              sats={difference}
              sign
              className={difference === 0 ? 'text-brand-bright' : 'text-warn'}
            />
          }
        />
        <Tile
          label="Matched"
          testId="rec-matched"
          value={
            <span className="num">
              {result.matched.length} of{' '}
              {result.matched.length + result.chainOnly.length + result.pending.length}
            </span>
          }
        />
      </div>
      <p className="text-muted mb-8 text-sm">
        In the books is the sum of posted entries on bank account {view.bankAccountNumber}. Bookie
        matches by txid (the external document number or the description), then by the exact BTC
        amount within three days of the block date. Pending transactions are matched only once they
        confirm.
      </p>

      <DraftBatches
        orgKey={orgKey}
        walletId={walletId}
        drafts={view.drafts.map((d) => ({
          batchId: d.batchId,
          batchCode: d.batchCode,
          lines: d.lines.map((l) => ({
            postingDate: l.postingDate,
            description: l.description,
            amountSats: l.amountSats,
            balancingAccountNumber: l.balancingAccountNumber,
          })),
        }))}
      />

      <section className="mb-8" aria-labelledby="rec-chain-only">
        <h3 id="rec-chain-only" className="text-ink mb-3 font-semibold">
          On chain, not in the books ({result.chainOnly.length})
        </h3>
        <DraftJournalForm
          orgKey={orgKey}
          walletId={walletId}
          bankAccountNumber={view.bankAccountNumber}
          accounts={accounts}
          rows={result.chainOnly.map((t) => ({
            txid: t.txid,
            date: t.date,
            netSats: t.netSats,
            feeSats: t.feeSats,
            direction: t.direction,
            drafted: drafted.has(t.txid),
          }))}
        />
      </section>

      <section className="mb-8" aria-labelledby="rec-books-only" data-testid="ledger-only">
        <h3 id="rec-books-only" className="text-ink mb-3 font-semibold">
          In the books, not on chain ({result.ledgerOnly.length})
        </h3>
        <DataTable
          columns={ledgerColumns}
          rows={result.ledgerOnly}
          rowKey={(e) => e.id}
          empty={
            <p className="text-muted card px-5 py-4 text-sm">
              Every entry in the books is on chain.
            </p>
          }
        />
      </section>

      <section className="mb-8" aria-labelledby="rec-matched-title" data-testid="matched">
        <h3 id="rec-matched-title" className="text-ink mb-3 font-semibold">
          Matched ({result.matched.length})
        </h3>
        <DataTable
          columns={matchedColumns}
          rows={result.matched}
          rowKey={(m) => m.tx.txid}
          empty={<p className="text-muted card px-5 py-4 text-sm">Nothing matched yet.</p>}
        />
      </section>

      {result.pending.length > 0 && (
        <section aria-labelledby="rec-pending" data-testid="rec-pending">
          <h3 id="rec-pending" className="text-ink mb-3 font-semibold">
            Pending ({result.pending.length})
          </h3>
          <ul className="card divide-line divide-y text-sm">
            {result.pending.map((t) => (
              <li key={t.txid} className="flex justify-between gap-3 px-5 py-3">
                <span className="font-mono text-xs" title={t.txid}>
                  {shortTxid(t.txid)}
                </span>
                <span className="text-muted">Unconfirmed: reconciled once it is mined</span>
                <BtcAmount sats={t.netSats} sign />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
