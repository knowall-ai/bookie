import type { IsoDate } from './types';

/** Today's date (UTC) as `YYYY-MM-DD`. */
export function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
