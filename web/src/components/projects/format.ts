/** `3120` minutes → `52h`; `125` → `2h 5m`. Undefined when the source has no time data. */
export function formatHours(minutes: number | undefined): string {
  if (minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
