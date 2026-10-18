'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FilePlus2, Send } from 'lucide-react';
import { formatBtc, shortTxid } from '@/lib/bitcoin/format';
import {
  draftBitcoinJournalAction,
  postBitcoinJournalAction,
} from '@/lib/portal/actions/bitcoin-reconcile';
import { formatDate } from '@/lib/ui/format';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';

export interface ChainOnlyRow {
  txid: string;
  date?: string;
  netSats: number;
  feeSats?: number;
  direction: 'in' | 'out' | 'self';
  drafted: boolean;
}

export interface DraftView {
  batchId: string;
  batchCode: string;
  lines: {
    postingDate: string;
    description: string;
    amountSats: number;
    balancingAccountNumber: string;
  }[];
}

const NEEDS_FEE = (r: ChainOnlyRow) => r.direction !== 'in' && r.feeSats !== undefined;

/** On chain, not in the books: choose transactions and accounts, then draft journal lines. */
export function DraftJournalForm({
  orgKey,
  walletId,
  bankAccountNumber,
  rows,
  accounts,
}: {
  orgKey: string;
  walletId: string;
  bankAccountNumber: string;
  rows: ChainOnlyRow[];
  accounts: { code: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counter, setCounter] = useState('');
  const [fee, setFee] = useState('');
  const [confirming, setConfirming] = useState(false);
  const open = rows.filter((r) => !r.drafted);
  const chosen = useMemo(() => open.filter((r) => selected.has(r.txid)), [open, selected]);
  const needsFee = chosen.some(NEEDS_FEE);

  const toggle = (txid: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(txid)) next.delete(txid);
      else next.add(txid);
      return next;
    });

  const draft = () =>
    start(async () => {
      const result = await draftBitcoinJournalAction({
        orgKey,
        walletId,
        txids: chosen.map((r) => r.txid),
        counterAccount: counter,
        feeAccount: needsFee ? fee : undefined,
      });
      setConfirming(false);
      if (!result.ok) return void toast.error(result.error);
      toast.success(
        `Drafted ${result.data.lines} journal ${result.data.lines === 1 ? 'line' : 'lines'} in batch ${result.data.batchCode}. Nothing is posted yet.`
      );
      setSelected(new Set());
      router.refresh();
    });

  if (rows.length === 0) {
    return (
      <p className="text-muted card px-5 py-4 text-sm" data-testid="chain-only-empty">
        Every confirmed transaction is in the books.
      </p>
    );
  }

  return (
    <div className="card overflow-hidden" data-testid="chain-only">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-line bg-surface-2/60 border-b">
              <th scope="col" className="w-10 px-4 py-3">
                <span className="sr-only">Choose</span>
              </th>
              {['Date', 'Transaction', 'Fee', 'Amount'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className={`text-muted px-4 py-3 text-xs font-semibold tracking-wide uppercase ${h === 'Date' || h === 'Transaction' ? 'text-left' : 'text-right'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.txid} className="border-line border-b last:border-0">
                <td className="px-4 py-3">
                  {r.drafted ? (
                    <Badge tone="violet">Drafted</Badge>
                  ) : (
                    <input
                      type="checkbox"
                      className="accent-brand h-4 w-4"
                      checked={selected.has(r.txid)}
                      onChange={() => toggle(r.txid)}
                      aria-label={`Draft ${shortTxid(r.txid)}`}
                    />
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDate(r.date)}</td>
                <td className="px-4 py-3 font-mono text-xs" title={r.txid}>
                  {shortTxid(r.txid)}
                </td>
                <td className="text-muted num px-4 py-3 text-right whitespace-nowrap">
                  {r.feeSats === undefined ? '' : formatBtc(r.feeSats)}
                </td>
                <td
                  className={`num px-4 py-3 text-right whitespace-nowrap ${r.netSats < 0 ? 'text-danger' : 'text-brand-bright'}`}
                >
                  {formatBtc(r.netSats, { sign: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open.length > 0 && (
        <form
          className="border-line bg-surface-2/40 grid gap-4 border-t p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
        >
          <Field
            label="Other side of each payment or receipt"
            htmlFor="btc-counter"
            hint="Often a suspense or clearing account, re-coded later"
          >
            <Select
              id="btc-counter"
              value={counter}
              onChange={(e) => setCounter(e.target.value)}
              required
            >
              <option value="">Choose an account…</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Network fees"
            htmlFor="btc-fee"
            hint={needsFee ? 'Fees are drafted as their own line' : 'Only needed for payments out'}
          >
            <Select
              id="btc-fee"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              required={needsFee}
              disabled={!needsFee}
            >
              <option value="">Choose an account…</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={pending || chosen.length === 0}
            data-testid="draft-journal"
          >
            <FilePlus2 className="h-4 w-4" /> Draft journal lines
          </Button>
        </form>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Draft journal lines for ${chosen.length} ${chosen.length === 1 ? 'transaction' : 'transactions'}?`}
          body={
            <>
              Bookie will create a new general journal batch with these lines on bank account{' '}
              {bankAccountNumber}, in BTC, each with its txid as the external document number.
              Nothing is posted until you choose Post.
            </>
          }
          cta="Draft lines"
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={draft}
        />
      )}
    </div>
  );
}

/** Bookie's drafted, unposted batches for this wallet, each posted only after confirmation. */
export function DraftBatches({
  orgKey,
  walletId,
  drafts,
}: {
  orgKey: string;
  walletId: string;
  drafts: DraftView[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [posting, setPosting] = useState<DraftView | null>(null);

  const post = (draft: DraftView) =>
    start(async () => {
      const result = await postBitcoinJournalAction({ orgKey, walletId, batchId: draft.batchId });
      setPosting(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Posted batch ${draft.batchCode}`);
      router.refresh();
    });

  if (drafts.length === 0) return null;
  return (
    <section className="mb-8" aria-labelledby="btc-drafts" data-testid="btc-drafts">
      <h3 id="btc-drafts" className="text-ink mb-3 font-semibold">
        Drafted, not posted
      </h3>
      <div className="space-y-4">
        {drafts.map((d) => {
          const total = d.lines.reduce((s, l) => s + l.amountSats, 0);
          return (
            <div key={d.batchId} className="card overflow-hidden">
              <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                <p className="text-ink text-sm font-medium">
                  Batch {d.batchCode} · {d.lines.length} {d.lines.length === 1 ? 'line' : 'lines'} ·{' '}
                  <span className="num">{formatBtc(total, { sign: true })}</span>
                </p>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setPosting(d)}
                  data-testid={`post-${d.batchCode}`}
                >
                  <Send className="h-4 w-4" /> Post
                </Button>
              </div>
              <ul className="divide-line divide-y text-sm">
                {d.lines.map((l, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 px-5 py-2">
                    <span className="text-muted min-w-0 truncate">
                      {formatDate(l.postingDate)} · {l.description} · against{' '}
                      {l.balancingAccountNumber}
                    </span>
                    <span className="num">{formatBtc(l.amountSats, { sign: true })}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {posting && (
        <ConfirmDialog
          title={`Post batch ${posting.batchCode}?`}
          body={`This posts ${posting.lines.length} ${posting.lines.length === 1 ? 'line' : 'lines'} to your live books. Business Central converts BTC to your local currency at its own exchange rate for each posting date. Posted entries can only be reversed, not deleted.`}
          cta="Post to the books"
          danger
          busy={pending}
          onCancel={() => setPosting(null)}
          onConfirm={() => post(posting)}
        />
      )}
    </section>
  );
}
