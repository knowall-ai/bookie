import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, Search } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { canPay, openDocuments, unreconciledEntries } from '@/lib/portal/reconcile';
import {
  findRecorded,
  isCalendarDate,
  reconcileLines,
  searchCandidates,
  type BankLine,
  type LineOutcome,
  type MatchOptions,
  type Suggestion,
} from '@/lib/reconcile/match';
import type { BankAccount, BankTransaction, Invoice } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { Money } from '@/components/ui/Money';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/States';
import { SourceNote } from '@/components/accounting/SourceNote';
import { MatchButton } from '@/components/accounting/MatchButton';
import { registerTypeLabel } from '@/components/accounting/register';

export const metadata = { title: 'Reconcile' };

/** A line typed into Find & match, when every field is valid. */
function manualLine(query: Record<string, string | undefined>): BankLine | undefined {
  const amount = Number(query.amount);
  const direction = query.direction === 'out' ? 'out' : query.direction === 'in' ? 'in' : undefined;
  if (!direction || !(amount > 0) || !query.date || !isCalendarDate(query.date)) return undefined;
  return {
    id: 'manual',
    direction,
    amount: Math.round(amount * 100) / 100,
    date: query.date,
    reference: query.text?.trim().slice(0, 100) || undefined,
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ org: orgParam, id: rawId }, query] = await Promise.all([params, searchParams]);
  const { connector, base, org } = await orgContext(orgParam);
  const bank = connector.bank;
  if (!bank) notFound();
  const id = decodeURIComponent(rawId);
  const account = (await bank.accounts()).find((a) => a.id === id);
  if (!account) notFound();

  const source = sourceName(org);
  const guide = bank.reconcile;
  const reconcileUrl = guide?.url?.(account);
  const currency = account.currency || undefined;
  const options: MatchOptions = { accountCurrency: currency, sourceName: source };
  const path = `${base}/accounting/bank/${encodeURIComponent(id)}`;

  const statement = bank.statementLines ? await bank.statementLines(id) : undefined;
  const lines: BankLine[] = (statement ?? []).map((l) => ({
    id: l.id,
    date: l.date,
    direction: l.direction,
    amount: l.amount,
    currency: l.currency,
    reference: l.reference,
    description: l.description,
    payee: l.payee,
  }));
  const fromStatement = query.line ? lines.find((l) => l.id === query.line) : undefined;
  const typed = query.line ? undefined : manualLine(query);
  const target = fromStatement ?? typed;
  const search = query.q?.trim().slice(0, 100) || undefined;

  const wants = (direction: BankLine['direction']) =>
    lines.some((l) => l.direction === direction) || target?.direction === direction;
  const none = { items: [] as Invoice[], hasMore: false };
  const [sales, bills, entries, searched] = await Promise.all([
    wants('in') ? openDocuments(connector, 'sales') : none,
    wants('out') ? openDocuments(connector, 'purchase') : none,
    unreconciledEntries(connector, account, target ? [...lines, target] : lines),
    target && search
      ? openDocuments(connector, target.direction === 'in' ? 'sales' : 'purchase', search)
      : undefined,
  ]);
  const candidates = [...sales.items, ...bills.items];
  const outcomes = reconcileLines(lines, candidates, entries ?? [], options);
  // Without a search, Find & match looks at the same open documents as the suggestions.
  const found = searched ?? (target?.direction === 'out' ? bills : sales);
  // A statement line keeps the outcome it has above; a typed line only gets a warning.
  const targetOutcome = fromStatement ? outcomes.get(fromStatement.id) : undefined;
  const similar = typed && entries ? findRecorded(typed, entries) : undefined;
  const results = target ? searchCandidates(target, found.items, search, options) : [];

  const docHref = (invoice: Invoice) =>
    `${base}/${invoice.type === 'sales' ? 'sales/invoices' : 'purchases/bills'}/${encodeURIComponent(invoice.id)}`;
  // Without the register Bookie can't rule out a duplicate, so it doesn't offer Match.
  const unchecked = entries
    ? undefined
    : `Bookie couldn't read all of this account's transactions in ${source}, so it can't check whether a payment is already recorded.`;
  const afterPayment = guide?.afterPayment ?? `Reconcile the statement line in ${source}.`;

  const matchCell = (line: BankLine, s: Suggestion) => {
    const blocked =
      s.blocked ??
      unchecked ??
      (canPay(connector, s.invoice.type)
        ? undefined
        : `${source} doesn't let Bookie record this payment. Record it in ${source}.`);
    if (blocked || s.invoice.amountDue === undefined) {
      return <span className="text-muted max-w-xs text-xs">{blocked}</span>;
    }
    return (
      <MatchButton
        orgKey={org.key}
        bankAccountId={account.id}
        bankAccountName={account.name}
        lineId={lines.includes(line) ? line.id : undefined}
        expectedAmountDue={s.invoice.amountDue}
        similar={line === typed && similar ? describeEntry(similar) : undefined}
        line={{
          direction: line.direction,
          date: line.date,
          amount: line.amount,
          currency: s.invoice.currency,
          reference: line.reference,
        }}
        document={{
          id: s.invoice.id,
          number: s.invoice.number,
          contactName: s.invoice.contact.name,
          kind: s.invoice.type === 'sales' ? 'invoice' : 'bill',
        }}
        sourceName={source}
        afterPayment={afterPayment}
        reconcileUrl={reconcileUrl}
      />
    );
  };

  const suggestionList = (line: BankLine, suggestions: Suggestion[]) => (
    <ol className="divide-line divide-y" aria-label="Suggested matches">
      {suggestions.map((s) => (
        <li
          key={s.invoice.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3"
          data-testid="suggestion"
        >
          <div className="min-w-0">
            <p className="text-ink text-sm">
              <Link href={docHref(s.invoice)} className="font-semibold hover:underline">
                {s.invoice.number}
              </Link>{' '}
              · {s.invoice.contact.name}
              {s.invoice.amountDue !== undefined && (
                <>
                  {' '}
                  · <Money amount={s.invoice.amountDue} currency={s.invoice.currency} /> due
                </>
              )}
              {s.invoice.dueDate && <> · due {formatDate(s.invoice.dueDate)}</>}
            </p>
            <p className="text-muted mt-0.5 text-xs" data-testid="reasons">
              {s.reasons.join(' · ')}
            </p>
          </div>
          {matchCell(line, s)}
        </li>
      ))}
    </ol>
  );

  const otherCurrencyNote = (invoices: Invoice[]) =>
    invoices.length > 0 && (
      <p className="text-muted mt-2 text-xs" data-testid="other-currency">
        {invoices.map((i) => `${i.number} is in ${i.currency}`).join('; ')}. Bookie only matches
        documents in {currency}, this account&apos;s currency.
      </p>
    );

  const findHref = (line: BankLine) => `${path}/reconcile?line=${encodeURIComponent(line.id)}#find`;

  const outcomeView = (line: BankLine, outcome: LineOutcome | undefined) => {
    if (!outcome) return null;
    switch (outcome.kind) {
      case 'already-recorded':
        return (
          <AlreadyRecorded entry={outcome.entry} source={source} reconcileUrl={reconcileUrl} />
        );
      case 'not-comparable':
        return <p className="text-muted text-sm">{outcome.reason}</p>;
      case 'no-match':
        return (
          <div>
            <p className="text-body flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">No match found</span>
              <ButtonLink href={findHref(line)} size="sm">
                <Search className="h-3.5 w-3.5" /> Find &amp; match
              </ButtonLink>
            </p>
            {otherCurrencyNote(outcome.otherCurrency)}
          </div>
        );
      case 'suggestions':
        return (
          <div>
            {suggestionList(line, outcome.suggestions)}
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link href={findHref(line)} className="text-brand text-xs hover:underline">
                Not these? Find &amp; match
              </Link>
            </div>
            {otherCurrencyNote(outcome.otherCurrency)}
          </div>
        );
    }
  };

  return (
    <>
      <PageHeader
        title={account.name}
        crumbs={[
          { label: 'Accounting', href: `${base}/accounting` },
          { label: 'Bank accounts', href: `${base}/accounting/bank` },
          { label: account.name, href: path },
        ]}
        meta={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>Reconcile</span>
            {account.accountNumber && <span>{account.accountNumber}</span>}
          </span>
        }
        actions={
          <>
            <ButtonLink href={path}>Account transactions</ButtonLink>
            {reconcileUrl && (
              <ButtonLink href={reconcileUrl} target="_blank" rel="noreferrer">
                Reconcile in {source} <ExternalLink className="h-3.5 w-3.5" />
              </ButtonLink>
            )}
          </>
        }
      />
      <SourceNote>{statement ? undefined : guide?.statementLinesNote}</SourceNote>
      <SourceNote>
        {canPay(connector, 'sales') || canPay(connector, 'purchase')
          ? `Match records a payment against the invoice or bill. ${afterPayment}`
          : afterPayment}
      </SourceNote>
      <SourceNote>{unchecked}</SourceNote>
      {(sales.hasMore || bills.hasMore) && (
        <SourceNote>
          Bookie compared the latest 100 open invoices and bills. Use Find &amp; match to search
          older ones.
        </SourceNote>
      )}

      {statement && (
        <section aria-labelledby="lines-heading" className="mb-8">
          <h2 id="lines-heading" className="text-ink mb-3 text-sm font-semibold">
            Bank statement lines to reconcile
          </h2>
          {lines.length === 0 ? (
            <EmptyState title="Nothing to reconcile" />
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="card grid gap-4 p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]"
                  data-testid="statement-line"
                  data-line-id={line.id}
                >
                  <LineSummary line={line} currency={currency} />
                  <div className="md:border-line min-w-0 md:border-l md:pl-4">
                    {outcomeView(line, outcomes.get(line.id))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section id="find" aria-labelledby="find-heading" className="card p-5">
        <h2 id="find-heading" className="text-ink text-sm font-semibold">
          Find &amp; match
        </h2>
        <p className="text-muted mt-1 text-sm">
          {fromStatement
            ? 'Search the open invoices and bills for this statement line.'
            : 'Enter a line from your bank statement to find the invoice or bill it pays.'}{' '}
          Bookie matches one line to one invoice or bill.
        </p>
        <FindForm
          action={`${path}/reconcile`}
          account={account}
          target={fromStatement}
          query={query}
          search={search}
        />
        {target && (
          <div className="mt-4" data-testid="find-results">
            {fromStatement && <LineSummary line={fromStatement} currency={currency} />}
            {found.hasMore && (
              <p className="text-muted mt-3 text-xs">
                Bookie looked at the latest 100 open{' '}
                {target.direction === 'in' ? 'invoices' : 'bills'}
                {search ? ` matching “${search}”` : ''}. Search to narrow it down.
              </p>
            )}
            {similar && (
              <p className="text-warn mt-3 text-sm" data-testid="similar-entry">
                Already in the books for this amount: {describeEntry(similar)}, not yet reconciled.
                If this line is that, reconcile it in {source} instead of matching.
              </p>
            )}
            <div className="mt-3">
              {targetOutcome?.kind === 'already-recorded' ? (
                <AlreadyRecorded
                  entry={targetOutcome.entry}
                  source={source}
                  reconcileUrl={reconcileUrl}
                />
              ) : results.length ? (
                suggestionList(target, results)
              ) : (
                <p className="text-body text-sm">
                  No single open {target.direction === 'in' ? 'invoice' : 'bill'} in {currency} has
                  this much or more due{search ? ` and matches “${search}”` : ''}.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function LineSummary({ line, currency }: { line: BankLine; currency?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-faint text-xs">{formatDate(line.date)}</p>
      <p className="text-ink mt-0.5 truncate text-sm font-medium">
        {line.description || line.payee || line.reference || '—'}
      </p>
      {line.reference && line.reference !== line.description && (
        <p className="text-muted truncate text-xs">Ref: {line.reference}</p>
      )}
      <p className="mt-1 text-sm">
        <span className="text-muted">{line.direction === 'in' ? 'Received ' : 'Spent '}</span>
        <Money amount={line.amount} currency={line.currency ?? currency} className="text-ink" />
      </p>
    </div>
  );
}

/** "payment for INV-0042 on 3 Oct 2026" or "receive money on 3 Oct 2026". */
function describeEntry(entry: BankTransaction): string {
  const what =
    entry.source === 'payment'
      ? `payment${entry.document?.number ? ` for ${entry.document.number}` : ''}`
      : registerTypeLabel(entry).toLowerCase();
  return `${what} on ${formatDate(entry.date)}`;
}

function AlreadyRecorded({
  entry,
  source,
  reconcileUrl,
}: {
  entry: BankTransaction;
  source: string;
  reconcileUrl?: string;
}) {
  const what =
    entry.source === 'payment'
      ? `Payment already recorded${entry.document?.number ? ` for ${entry.document.number}` : ''}`
      : `Already in the books as ${registerTypeLabel(entry).toLowerCase()}`;
  return (
    <p className="text-body text-sm" data-testid="already-recorded">
      <span className="font-medium">{what}</span> on {formatDate(entry.date)}; reconcile it in{' '}
      {reconcileUrl ? (
        <a href={reconcileUrl} target="_blank" rel="noreferrer" className="text-brand underline">
          {source}
        </a>
      ) : (
        source
      )}
      .
    </p>
  );
}

function FindForm({
  action,
  account,
  target,
  query,
  search,
}: {
  action: string;
  account: BankAccount;
  /** The statement line being matched; absent when the line is typed in. */
  target?: BankLine;
  query: Record<string, string | undefined>;
  search?: string;
}) {
  return (
    <form
      method="get"
      action={`${action}#find`}
      aria-label="Find and match"
      className="mt-4 flex flex-wrap items-end gap-3"
    >
      {target ? (
        <input type="hidden" name="line" value={target.id} />
      ) : (
        <>
          <Field label="Money" htmlFor="find-direction" className="w-36">
            <Select id="find-direction" name="direction" defaultValue={query.direction ?? 'in'}>
              <option value="in">Received</option>
              <option value="out">Spent</option>
            </Select>
          </Field>
          <Field
            label={account.currency ? `Amount (${account.currency})` : 'Amount'}
            htmlFor="find-amount"
            className="w-36"
          >
            <Input
              id="find-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              className="num"
              required
              defaultValue={query.amount}
            />
          </Field>
          <Field label="Date" htmlFor="find-date" className="w-40">
            <Input id="find-date" name="date" type="date" required defaultValue={query.date} />
          </Field>
          <Field label="Statement reference" htmlFor="find-text" className="w-full sm:w-56">
            <Input id="find-text" name="text" defaultValue={query.text} maxLength={100} />
          </Field>
        </>
      )}
      <Field label="Search invoices and bills" htmlFor="find-q" className="w-full sm:w-64">
        <Input
          id="find-q"
          name="q"
          type="search"
          placeholder="Number, reference or contact"
          defaultValue={search}
        />
      </Field>
      <Button type="submit" variant="primary">
        <Search className="h-4 w-4" /> Find
      </Button>
    </form>
  );
}
