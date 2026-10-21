import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import type { BankTransaction, Invoice, InvoiceType, Opportunity, Page } from '@/lib/domain/types';
import { computeForecast, forecastCurrencies } from './compute';
import { addMonths, monthStart } from './dates';
import type { Forecast, ForecastHorizon, PlannedItem, ProjectionMonths } from './types';

export interface ForecastRequest {
  horizon: ForecastHorizon;
  /** Defaults to the base currency. */
  currency?: string;
  includeDrafts?: boolean;
  includePipeline?: boolean;
  /** Undefined = projection off (the default). */
  projectionMonths?: ProjectionMonths;
}

export interface ForecastResult {
  forecast: Forecast;
  /** Currencies there is something to forecast in, base first. */
  currencies: string[];
  baseCurrency?: string;
  /** Can the projection be switched on? When not, why not. */
  projection: { available: boolean; reason?: string };
  pipeline: { available: boolean; reason?: string };
  /** What the source said about partial data (e.g. BC bills without amounts). */
  notes: string[];
}

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

async function allPages<T>(
  fetchPage: (page: number) => Promise<Page<T>>
): Promise<{ items: T[]; notes: string[]; complete: boolean }> {
  const items: T[] = [];
  const notes = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await fetchPage(page);
    items.push(...result.items);
    if (result.note) notes.add(result.note);
    if (!result.hasMore) return { items, notes: [...notes], complete: true };
  }
  return { items, notes: [...notes], complete: false };
}

export class ForecastUnavailableError extends Error {}

/** The forecast for one organisation, read live from its connector. Read-only. */
export async function loadForecast(
  connector: AccountingConnector,
  planned: PlannedItem[],
  request: ForecastRequest,
  sourceName: string,
  today = new Date().toISOString().slice(0, 10)
): Promise<ForecastResult> {
  const { bank, invoices } = connector;
  if (!bank || !invoices) {
    throw new ForecastUnavailableError(
      `${sourceName} doesn't give Bookie bank balances and invoices for this organisation, so there's nothing to forecast from.`
    );
  }

  const unpaid = (type: InvoiceType, status: string) =>
    allPages((page) => invoices.list(type, { status, page, pageSize: PAGE_SIZE }));
  const statuses = ['authorised', ...(request.includeDrafts ? ['draft', 'submitted'] : [])];

  const [details, accounts, ...lists] = await Promise.all([
    connector.organisation(),
    bank.accounts(),
    ...statuses.flatMap((status) => [unpaid('sales', status), unpaid('purchase', status)]),
  ]);
  if (lists.some((l) => !l.complete)) {
    throw new ForecastUnavailableError(
      `There are more than ${(PAGE_SIZE * MAX_PAGES).toLocaleString('en-GB')} unpaid documents of one kind, more than Bookie reads for a forecast. Open the aged receivables and payables reports instead.`
    );
  }
  // A status filter the source can't honour exactly must not leak other statuses in.
  const docs: Invoice[] = lists.flatMap((l) => l.items).filter((d) => statuses.includes(d.status));
  const notes = [...new Set(lists.flatMap((l) => l.notes))];

  const pipeline = connector.opportunities
    ? { available: true }
    : {
        available: false,
        reason: `${sourceName} has no sales opportunities, so there's no pipeline to add.`,
      };
  let opportunities: Opportunity[] = [];
  if (request.includePipeline && connector.opportunities) {
    const result = await allPages((page) =>
      connector.opportunities!.list({ open: true, page, pageSize: PAGE_SIZE })
    );
    if (!result.complete)
      throw new ForecastUnavailableError(
        `There are more than ${(PAGE_SIZE * MAX_PAGES).toLocaleString('en-GB')} open opportunities, more than Bookie reads for a forecast.`
      );
    opportunities = result.items;
    notes.push(...result.notes.filter((note) => !notes.includes(note)));
  }

  const base = details.baseCurrency;
  const currencies = forecastCurrencies(accounts, docs, planned, base);
  const currency =
    request.currency && currencies.includes(request.currency)
      ? request.currency
      : (currencies[0] ?? '');

  const projectionAccounts = accounts.filter((a) => a.currency === currency);
  const projection = await projectionSource(
    connector,
    projectionAccounts,
    request.projectionMonths,
    today,
    sourceName
  );

  const forecast = computeForecast({
    today,
    horizon: request.horizon,
    currency,
    includeDrafts: request.includeDrafts,
    includePipeline: !!request.includePipeline && pipeline.available,
    opportunities,
    bankAccounts: accounts,
    invoices: docs,
    planned,
    projection:
      request.projectionMonths && projection.transactions
        ? { months: request.projectionMonths, transactions: projection.transactions }
        : undefined,
    projectionUnavailable: projection.reason,
    sourceName,
  });
  return {
    forecast,
    currencies,
    baseCurrency: base,
    pipeline,
    projection: { available: !projection.reason, reason: projection.reason },
    notes,
  };
}

/**
 * Bank transactions for the projection, or why there can't be one. The
 * projection needs to tell spend/receive money apart from invoice and bill
 * payments (which are already in Known); a source that can't say which is
 * which can't support it. When the projection is off we only probe a few rows
 * so the toggle can say up front whether it would work.
 */
async function projectionSource(
  connector: AccountingConnector,
  accounts: { id: string; name: string; currency: string }[],
  months: ProjectionMonths | undefined,
  today: string,
  sourceName: string
): Promise<{ transactions?: BankTransaction[]; reason?: string }> {
  const bank = connector.bank!;
  if (!accounts.length) {
    return { reason: `There's no bank account in this currency to average transactions from.` };
  }
  const unclassified = (rows: BankTransaction[]) =>
    rows.some(
      (t) =>
        t.status === 'authorised' &&
        (t.type === 'receive' || t.type === 'spend') &&
        t.source === undefined
    );
  const cannotSeparate = `${sourceName}'s bank transactions don't say which ones are invoice or bill payments, so Bookie can't separate other spending from what's already in your invoices and bills.`;

  try {
    if (!months) {
      const probe = await bank.transactions(accounts[0].id, { page: 1, pageSize: 10 });
      if (!probe.items.length && probe.note) return { reason: probe.note };
      if (unclassified(probe.items)) return { reason: cannotSeparate };
      return {};
    }
    const from = addMonths(monthStart(today), -months);
    const to = new Date(Date.parse(`${monthStart(today)}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const transactions: BankTransaction[] = [];
    for (const account of accounts) {
      let page = 1;
      for (; page <= 20; page++) {
        const result = await bank.transactions(account.id, { from, to, page, pageSize: 500 });
        if (!result.items.length && result.note && page === 1) return { reason: result.note };
        // A register is in its account's currency when the row doesn't say otherwise.
        transactions.push(
          ...result.items.map((t) => ({ ...t, currency: t.currency || account.currency }))
        );
        if (result.note && result.items.length && !result.hasMore) {
          // The source stopped short of the whole period (e.g. Xero's 1,000-row register).
          return {
            reason: `${sourceName} only lets Bookie read part of ${account.name}'s transactions for that period, so an average would be wrong. Try a shorter period.`,
          };
        }
        if (!result.hasMore) break;
      }
      if (page > 20) {
        return {
          reason: `${account.name} has too many transactions in that period for Bookie to average. Try a shorter period.`,
        };
      }
    }
    if (unclassified(transactions)) return { reason: cannotSeparate };
    return { transactions };
  } catch {
    return { reason: `${sourceName} didn't return the bank transactions needed for a projection.` };
  }
}
