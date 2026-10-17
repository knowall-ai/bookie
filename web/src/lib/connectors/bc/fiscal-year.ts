import type { IsoDate } from '@/lib/domain/types';
import type { BcClient, ODataList } from './client';

/** BC API v2.0 `accountingPeriods`, trimmed to what Bookie reads. */
export interface BcAccountingPeriod {
  startingDate: string;
  newFiscalYear?: boolean;
}

export const BC_FY_NOT_SET_UP = "Financial year isn't set up in Business Central.";
export const BC_FY_UNREADABLE = "Business Central didn't return its accounting periods.";

/**
 * Start of the financial year containing `date`: the latest accounting period
 * flagged "New Fiscal Year" that starts on or before it. Undefined when BC has
 * no such period (financial year not set up). Never assumes 1 January.
 */
export function fiscalYearStartFrom(
  periods: BcAccountingPeriod[],
  date: IsoDate
): IsoDate | undefined {
  return periods
    .filter((p) => p.newFiscalYear !== false && p.startingDate)
    .map((p) => p.startingDate.slice(0, 10))
    .filter((start) => !start.startsWith('0001') && start <= date)
    .sort()
    .at(-1);
}

export type BcFiscalYear =
  { start: IsoDate; note?: undefined } | { start?: undefined; note: string };

/** Looks up the financial year start for a date from BC's accounting periods. */
export function bcFiscalYear(client: BcClient) {
  let periods: Promise<BcAccountingPeriod[] | undefined> | undefined;
  const load = () =>
    (periods ??= client
      .request<ODataList<BcAccountingPeriod>>('accountingPeriods', {
        query: { $filter: 'newFiscalYear eq true', $orderby: 'startingDate' },
      })
      .then((r) => r.value)
      .catch(() => undefined));
  return async (date: IsoDate): Promise<BcFiscalYear> => {
    const rows = await load();
    if (!rows) return { note: BC_FY_UNREADABLE };
    const start = fiscalYearStartFrom(rows, date);
    return start ? { start } : { note: BC_FY_NOT_SET_UP };
  };
}
