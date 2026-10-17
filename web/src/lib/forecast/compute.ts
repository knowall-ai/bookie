/**
 * The cash flow forecast, as a pure function of what the source and the user provided.
 *
 * Used by the Reporting › Cash flow forecast page and by Bookie's
 * `cash_flow_forecast` tool, so both always tell the same story.
 *
 * Rules (no guessing):
 * - One currency at a time. Currencies are never added together or converted.
 * - Opening balance = the real bank balances in that currency; accounts with no
 *   known balance (or a balance the source only gives converted) are listed as
 *   excluded, with the reason.
 * - Known = approved (awaiting payment) invoices and bills, by due date. Overdue
 *   ones are kept out of every bucket ("timing unknown"). Unknown amounts are
 *   listed and never added.
 * - Drafts and awaiting approval, planned items and the projection are separate,
 *   labelled layers. Drafts and the projection are off unless asked for.
 */
import type { BankAccount, BankTransaction, Invoice, IsoDate } from '@/lib/domain/types';
import {
  addDays,
  addMonths,
  dayMonth,
  daysInclusive,
  monthEnd,
  monthShort,
  monthStart,
  monthYear,
  weekStart,
} from './dates';
import {
  LAYER_LABELS,
  type Direction,
  type ExcludedAccount,
  type Forecast,
  type ForecastBucket,
  type ForecastEntry,
  type ForecastHorizon,
  type LayerTotals,
  type OpeningAccount,
  type PlannedItem,
  type ProjectionInfo,
  type ProjectionMonths,
} from './types';

export interface ForecastInput {
  today: IsoDate;
  horizon: ForecastHorizon;
  currency: string;
  includeDrafts?: boolean;
  bankAccounts: BankAccount[];
  /** Sales invoices and bills, any status; this function picks the unpaid ones. */
  invoices: Invoice[];
  planned: PlannedItem[];
  /** Only when the user switched the projection on and the source supports it. */
  projection?: { months: ProjectionMonths; transactions: BankTransaction[] };
  /** Why the projection can't be offered, passed through to the result. */
  projectionUnavailable?: string;
  /** "Xero", "Business Central"...: used in reasons. */
  sourceName: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const zeroTotals = (): LayerTotals => ({
  knownIn: 0,
  knownOut: 0,
  draftIn: 0,
  draftOut: 0,
  plannedIn: 0,
  plannedOut: 0,
  projectedIn: 0,
  projectedOut: 0,
});

/** The buckets of a horizon: Monday weeks or calendar months, the first starting today. */
export function forecastBuckets(today: IsoDate, horizon: ForecastHorizon): ForecastBucket[] {
  const buckets: ForecastBucket[] = [];
  if (horizon === '13w') {
    const monday = weekStart(today);
    for (let i = 0; i < 13; i++) {
      const start = addDays(monday, i * 7);
      buckets.push(
        bucket(
          `w${i}`,
          `Week of ${dayMonth(start)}`,
          dayMonth(start),
          i ? start : today,
          addDays(start, 6)
        )
      );
    }
  } else {
    const count = horizon === '6m' ? 6 : 12;
    for (let i = 0; i < count; i++) {
      const first = addMonths(monthStart(today), i);
      buckets.push(
        bucket(`m${i}`, monthYear(first), monthShort(first), i ? first : today, monthEnd(first))
      );
    }
  }
  return buckets;
}

function bucket(key: string, label: string, short: string, start: IsoDate, end: IsoDate) {
  return { key, label, short, start, end, totals: zeroTotals(), net: 0, entries: [] };
}

/**
 * Every date a planned item falls on between `from` and `to` (inclusive).
 * Monthly and quarterly repeats keep the original day of the month, clamped to
 * the month's end; weekly repeats step seven days.
 */
export function plannedOccurrences(item: PlannedItem, from: IsoDate, to: IsoDate): IsoDate[] {
  const last = item.repeat && item.endDate && item.endDate < to ? item.endDate : to;
  if (!item.repeat) return item.date >= from && item.date <= to ? [item.date] : [];
  const dates: IsoDate[] = [];
  for (let k = 0; k < 2000; k++) {
    const date =
      item.repeat === 'weekly'
        ? addDays(item.date, k * 7)
        : addMonths(item.date, k * (item.repeat === 'monthly' ? 1 : 3));
    if (date > last) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

/** Which bank balances open the forecast in `currency`, and which can't, with why. */
export function openingBalance(
  accounts: BankAccount[],
  currency: string,
  sourceName: string
): { balance?: number; accounts: OpeningAccount[]; excluded: ExcludedAccount[] } {
  const included: OpeningAccount[] = [];
  const excluded: ExcludedAccount[] = [];
  for (const a of accounts) {
    const converted = !!a.balanceCurrency && a.balanceCurrency !== a.currency;
    if (!a.currency) {
      excluded.push({
        id: a.id,
        name: a.name,
        reason: `${sourceName} doesn't say what currency this account is in.`,
      });
      continue;
    }
    if (a.currency !== currency && a.balanceCurrency !== currency) continue;
    if (a.balance === undefined) {
      excluded.push({
        id: a.id,
        name: a.name,
        currency: a.currency,
        reason: `${sourceName} doesn't report this account's balance.`,
      });
    } else if (converted) {
      excluded.push({
        id: a.id,
        name: a.name,
        currency: a.currency,
        reason:
          a.currency === currency
            ? `${sourceName} only reports this account's balance converted to ${a.balanceCurrency}, not in ${a.currency}.`
            : `A ${a.currency} account: ${sourceName} reports its balance converted to ${currency}, so Bookie keeps it out rather than mix currencies.`,
      });
    } else {
      included.push({ id: a.id, name: a.name, balance: a.balance });
    }
  }
  return {
    balance: included.length ? r2(included.reduce((s, a) => s + a.balance, 0)) : undefined,
    accounts: included,
    excluded,
  };
}

/**
 * Average monthly cash in and out over the last `months` complete calendar
 * months, from bank transactions that aren't invoice or bill payments
 * (spend and receive money only, transfers excluded).
 */
export function projectionFrom(
  transactions: BankTransaction[],
  months: ProjectionMonths,
  today: IsoDate,
  currency: string
): ProjectionInfo {
  const to = addDays(monthStart(today), -1);
  const from = addMonths(monthStart(today), -months);
  let inflow = 0;
  let outflow = 0;
  let count = 0;
  for (const t of transactions) {
    if (t.status !== 'authorised' || t.source !== 'bank-transaction') continue;
    if (t.type !== 'receive' && t.type !== 'spend') continue;
    if (t.currency !== currency || t.date < from || t.date > to) continue;
    count++;
    if (t.type === 'receive') inflow += t.amount;
    else outflow += t.amount;
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const period = `${sameYear ? monthShort(from) : monthYear(from)} to ${monthYear(to)}`;
  return {
    months,
    from,
    to,
    label: `Projection: average of ${period}`,
    monthlyIn: r2(inflow / months),
    monthlyOut: r2(outflow / months),
    transactionCount: count,
  };
}

function add(
  totals: LayerTotals,
  layer: ForecastEntry['layer'],
  direction: Direction,
  amount: number
) {
  const key = `${layer}${direction === 'in' ? 'In' : 'Out'}` as keyof LayerTotals;
  totals[key] = r2(totals[key] + amount);
}

export function computeForecast(input: ForecastInput): Forecast {
  const { today, currency, horizon } = input;
  const includeDrafts = !!input.includeDrafts;
  const buckets = forecastBuckets(today, horizon);
  const end = buckets[buckets.length - 1].end;
  const find = (date: IsoDate) => buckets.find((b) => date >= b.start && date <= b.end);

  const forecast: Forecast = {
    currency,
    horizon,
    today,
    end,
    layers: { known: true, drafts: includeDrafts, planned: true, projected: false },
    layersUsed: [],
    opening: openingBalance(input.bankAccounts, currency, input.sourceName),
    buckets,
    totals: zeroTotals(),
    overdue: {
      in: { count: 0, total: 0, entries: [] },
      out: { count: 0, total: 0, entries: [] },
    },
    noDueDate: [],
    afterHorizon: { in: 0, out: 0, count: 0 },
    unknownAmount: [],
    projectionUnavailable: input.projectionUnavailable,
  };

  // Documents: approved ones are Known; drafts and awaiting approval only when asked for.
  for (const doc of input.invoices) {
    if (doc.currency !== currency) continue;
    const known = doc.status === 'authorised';
    const draft = doc.status === 'draft' || doc.status === 'submitted';
    if (!known && !(draft && includeDrafts)) continue;
    const direction: Direction = doc.type === 'sales' ? 'in' : 'out';
    const entry: ForecastEntry = {
      layer: known ? 'known' : 'draft',
      direction,
      amount: doc.amountDue,
      date: doc.dueDate,
      label: doc.contact.name,
      document: {
        id: doc.id,
        number: doc.number,
        kind: doc.type === 'sales' ? 'invoice' : 'bill',
        status: doc.status as 'draft' | 'submitted' | 'authorised',
        contact: doc.contact.name,
      },
    };
    if (doc.amountDue === undefined) {
      forecast.unknownAmount.push(entry);
      continue;
    }
    if (doc.amountDue <= 0) continue;
    if (!doc.dueDate) {
      forecast.noDueDate.push(entry);
      continue;
    }
    if (doc.dueDate < today) {
      if (!known) {
        forecast.noDueDate.push(entry);
        continue;
      }
      const band = forecast.overdue[direction];
      band.count++;
      band.total = r2(band.total + doc.amountDue);
      band.entries.push(entry);
      continue;
    }
    const b = find(doc.dueDate);
    if (!b) {
      forecast.afterHorizon[direction] = r2(forecast.afterHorizon[direction] + doc.amountDue);
      forecast.afterHorizon.count++;
      continue;
    }
    b.entries.push(entry);
    add(b.totals, entry.layer, direction, doc.amountDue);
  }

  // Planned items: the user's own assumptions, expanded over the horizon.
  for (const item of input.planned) {
    if (item.currency !== currency) continue;
    for (const date of plannedOccurrences(item, today, end)) {
      const b = find(date);
      if (!b) continue;
      b.entries.push({
        layer: 'planned',
        direction: item.direction,
        amount: item.amount,
        date,
        label: item.description,
        plannedId: item.id,
      });
      add(b.totals, 'planned', item.direction, item.amount);
    }
  }

  // Projection: a daily rate from the averaged window, spread over each bucket's days.
  if (input.projection && !input.projectionUnavailable) {
    const p = projectionFrom(
      input.projection.transactions,
      input.projection.months,
      today,
      currency
    );
    const days = daysInclusive(p.from, p.to);
    forecast.projection = p;
    forecast.layers.projected = true;
    for (const b of buckets) {
      const share = daysInclusive(b.start, b.end) / days;
      const inflow = r2(p.monthlyIn * p.months * share);
      const outflow = r2(p.monthlyOut * p.months * share);
      for (const [direction, amount] of [
        ['in', inflow],
        ['out', outflow],
      ] as const) {
        if (!amount) continue;
        b.entries.push({
          layer: 'projected',
          direction,
          amount,
          date: b.start,
          label:
            direction === 'in' ? 'Average in, excluding invoices' : 'Average out, excluding bills',
        });
        add(b.totals, 'projected', direction, amount);
      }
    }
  }

  // Net per bucket from the layers that are on, the running balance, and the lowest point.
  let running = forecast.opening.balance;
  for (const b of buckets) {
    const t = b.totals;
    b.net = r2(
      t.knownIn -
        t.knownOut +
        (includeDrafts ? t.draftIn - t.draftOut : 0) +
        t.plannedIn -
        t.plannedOut +
        (forecast.layers.projected ? t.projectedIn - t.projectedOut : 0)
    );
    for (const key of Object.keys(t) as (keyof LayerTotals)[]) {
      forecast.totals[key] = r2(forecast.totals[key] + t[key]);
    }
    b.entries.sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''));
    if (running !== undefined) {
      b.opening = running;
      running = r2(running + b.net);
      b.closing = running;
      if (!forecast.lowest || running < forecast.lowest.balance) {
        forecast.lowest = {
          balance: running,
          bucketKey: b.key,
          label: b.label,
          belowZero: running < 0,
        };
      }
    }
  }
  forecast.closing = running;

  forecast.layersUsed = [
    LAYER_LABELS.known,
    ...(includeDrafts ? [LAYER_LABELS.draft] : []),
    LAYER_LABELS.planned,
    ...(forecast.projection ? [forecast.projection.label] : []),
  ];
  return forecast;
}

/** The currencies there is something to forecast in, base currency first. */
export function forecastCurrencies(
  accounts: BankAccount[],
  invoices: Invoice[],
  planned: PlannedItem[],
  base?: string
): string[] {
  const set = new Set<string>();
  for (const a of accounts) if (a.currency) set.add(a.currency);
  for (const i of invoices)
    if (
      i.currency &&
      (i.status === 'authorised' || i.status === 'draft' || i.status === 'submitted')
    )
      set.add(i.currency);
  for (const p of planned) set.add(p.currency);
  const rest = [...set].filter((c) => c !== base).sort();
  return base ? [base, ...rest] : rest;
}
