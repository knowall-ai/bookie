/**
 * Cash flow forecast: shapes shared by the pure computation, the page and Bookie's tool.
 *
 * No guessing: every figure here comes from the source system (bank balances,
 * unpaid invoices and bills), from the user (planned items), or from an
 * explicit, opt-in average of real bank transactions (the projection). Each
 * figure carries the layer it came from so nothing is ever mixed silently.
 */
import type { IsoDate } from '@/lib/domain/types';

export type ForecastHorizon = '13w' | '6m' | '12m';
export const FORECAST_HORIZONS: ForecastHorizon[] = ['13w', '6m', '12m'];
export const HORIZON_LABELS: Record<ForecastHorizon, string> = {
  '13w': '13 weeks',
  '6m': '6 months',
  '12m': '12 months',
};

export type ProjectionMonths = 3 | 6 | 12;
export const PROJECTION_MONTHS: ProjectionMonths[] = [3, 6, 12];

/** Where a forecast figure comes from. */
export type ForecastLayer = 'known' | 'draft' | 'planned' | 'projected';
export type Direction = 'in' | 'out';

export type PlannedRepeat = 'weekly' | 'monthly' | 'quarterly';

/** A line the user entered: an assumption, never mixed into "Known". */
export interface PlannedItem {
  id: string;
  description: string;
  /** Positive amount in `currency`. */
  amount: number;
  direction: Direction;
  currency: string;
  /** First (or only) date. */
  date: IsoDate;
  repeat?: PlannedRepeat;
  /** Last date a repeat may fall on (inclusive). */
  endDate?: IsoDate;
  createdAt?: string;
}

/** One entry placed in (or kept out of) a bucket. */
export interface ForecastEntry {
  layer: ForecastLayer;
  direction: Direction;
  /** Undefined when the source doesn't report what's left to pay (never counted). */
  amount?: number;
  date?: IsoDate;
  label: string;
  /** For documents. */
  document?: {
    id: string;
    number: string;
    kind: 'invoice' | 'bill';
    status: 'draft' | 'submitted' | 'authorised';
    contact: string;
  };
  /** For planned items: which item, and which occurrence. */
  plannedId?: string;
}

export interface LayerTotals {
  knownIn: number;
  knownOut: number;
  draftIn: number;
  draftOut: number;
  plannedIn: number;
  plannedOut: number;
  projectedIn: number;
  projectedOut: number;
}

export interface ForecastBucket {
  key: string;
  /** "Week of 3 Nov" / "Nov 2026". */
  label: string;
  /** Short axis label: "3 Nov" / "Nov". */
  short: string;
  /** First day counted (today for the first bucket). */
  start: IsoDate;
  end: IsoDate;
  totals: LayerTotals;
  /** Net of the layers switched on. */
  net: number;
  /** Running balance, when the opening balance is known. */
  opening?: number;
  closing?: number;
  entries: ForecastEntry[];
}

export interface OpeningAccount {
  id: string;
  name: string;
  balance: number;
}

export interface ExcludedAccount {
  id: string;
  name: string;
  currency?: string;
  reason: string;
}

export interface ProjectionInfo {
  months: ProjectionMonths;
  /** First and last day of the window averaged. */
  from: IsoDate;
  to: IsoDate;
  /** "Projection: average of Jul–Sep 2026". */
  label: string;
  monthlyIn: number;
  monthlyOut: number;
  /** Bank transactions the average is built from. */
  transactionCount: number;
}

export interface Forecast {
  currency: string;
  horizon: ForecastHorizon;
  today: IsoDate;
  /** Last day of the horizon. */
  end: IsoDate;
  layers: { known: true; drafts: boolean; planned: true; projected: boolean };
  /** Human labels for the layers that are switched on. */
  layersUsed: string[];
  opening: {
    /** Sum of the accounts below; undefined when no account in this currency has a known balance. */
    balance?: number;
    accounts: OpeningAccount[];
    excluded: ExcludedAccount[];
  };
  buckets: ForecastBucket[];
  /** Totals across the horizon, per layer. */
  totals: LayerTotals;
  closing?: number;
  lowest?: { balance: number; bucketKey: string; label: string; belowZero: boolean };
  /** Approved documents already past due: not placed on any date. */
  overdue: {
    in: { count: number; total: number; entries: ForecastEntry[] };
    out: { count: number; total: number; entries: ForecastEntry[] };
  };
  /** Documents with no due date at all (counted, not placed). */
  noDueDate: ForecastEntry[];
  /** Due after the horizon: counted, not placed. */
  afterHorizon: { in: number; out: number; count: number };
  /** Documents whose amount the source doesn't report: listed, never added. */
  unknownAmount: ForecastEntry[];
  projection?: ProjectionInfo;
  /** Why the projection can't be offered, when it can't. */
  projectionUnavailable?: string;
}

export const LAYER_LABELS: Record<ForecastLayer, string> = {
  known: 'Known: approved invoices and bills',
  draft: 'Drafts and awaiting approval',
  planned: 'Planned (you entered this)',
  projected: 'Projection',
};
