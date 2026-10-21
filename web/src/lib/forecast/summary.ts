/**
 * The forecast as Bookie's `cash_flow_forecast` tool returns it: the same
 * computed figures as the page, compact, with every layer named so the model
 * must say which ones it used.
 */
import type { Forecast, ForecastEntry } from './types';

const doc = (e: ForecastEntry) => ({
  number: e.document?.number,
  kind: e.document?.kind,
  contact: e.document?.contact ?? e.label,
  dueDate: e.date,
  amountDue: e.amount,
});

export function forecastForBookie(
  forecast: Forecast,
  extra: {
    currencies: string[];
    pipeline?: { available: boolean; reason?: string };
    projection: { available: boolean; reason?: string };
    notes: string[];
  }
) {
  const f = forecast;
  const on = { drafts: f.layers.drafts, projected: f.layers.projected };
  return {
    currency: f.currency,
    otherCurrencies: extra.currencies.filter((c) => c !== f.currency),
    currencyNote:
      'One currency per forecast. Never add or convert currencies; ask for another currency separately.',
    period: { from: f.today, to: f.end, horizon: f.horizon },
    layersUsed: f.layersUsed,
    layersNotUsed: [
      ...(f.layers.pipeline
        ? []
        : [
            extra.pipeline?.available
              ? 'Pipeline (include_pipeline was false)'
              : `Pipeline: not available (${extra.pipeline?.reason ?? 'No opportunities module'})`,
          ]),
      ...(on.drafts ? [] : ['Drafts and awaiting approval (include_drafts was false)']),
      ...(on.projected
        ? []
        : [
            extra.projection.available
              ? 'Projection of average spending (include_projection was false)'
              : `Projection: not available (${extra.projection.reason})`,
          ]),
    ],
    openingBalance: {
      balance: f.opening.balance,
      asOf: f.today,
      fromAccounts: f.opening.accounts.map((a) => ({ name: a.name, balance: a.balance })),
      excludedAccounts: f.opening.excluded.map((a) => ({ name: a.name, reason: a.reason })),
    },
    closingBalance: f.closing,
    lowestPoint: f.lowest
      ? {
          balance: f.lowest.balance,
          period: f.lowest.label,
          belowZero: f.lowest.belowZero,
          note: 'Lowest balance at the end of a period, from the layers used only.',
        }
      : undefined,
    totals: {
      ...(f.layers.pipeline ? { pipelineIn: f.totals.pipelineIn } : {}),
      knownIn: f.totals.knownIn,
      knownOut: f.totals.knownOut,
      plannedIn: f.totals.plannedIn,
      plannedOut: f.totals.plannedOut,
      ...(on.drafts ? { draftsIn: f.totals.draftIn, draftsOut: f.totals.draftOut } : {}),
      ...(on.projected
        ? { projectedIn: f.totals.projectedIn, projectedOut: f.totals.projectedOut }
        : {}),
    },
    periods: f.buckets.map((b) => ({
      period: b.label,
      from: b.start,
      to: b.end,
      ...(f.layers.pipeline ? { pipelineIn: b.totals.pipelineIn } : {}),
      knownIn: b.totals.knownIn,
      knownOut: b.totals.knownOut,
      plannedIn: b.totals.plannedIn,
      plannedOut: b.totals.plannedOut,
      ...(on.drafts ? { draftsIn: b.totals.draftIn, draftsOut: b.totals.draftOut } : {}),
      ...(on.projected
        ? { projectedIn: b.totals.projectedIn, projectedOut: b.totals.projectedOut }
        : {}),
      net: b.net,
      closingBalance: b.closing,
    })),
    overdueTimingUnknown: {
      note: 'Approved invoices and bills already past their due date. Not placed on any date or included in the balances.',
      owedToYou: { count: f.overdue.in.count, total: f.overdue.in.total },
      youOwe: { count: f.overdue.out.count, total: f.overdue.out.total },
    },
    dueAfterPeriod: f.afterHorizon,
    amountNotAvailable: {
      note: 'Documents whose amount due the source does not report. Never added to any total.',
      count: f.unknownAmount.length,
      documents: f.unknownAmount.slice(0, 20).map(doc),
    },
    noDueDate: f.noDueDate.slice(0, 20).map(doc),
    pipeline: {
      ...extra.pipeline,
      note: "Weighted by each opportunity's chance of success, on its estimated closing date. When the client pays may differ. Never fill in excluded opportunities' missing fields.",
      excluded: f.pipelineExcluded,
    },
    projection: f.projection,
    sourceNotes: extra.notes,
  };
}
