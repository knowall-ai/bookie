/** Round axis ticks (1, 2, 2.5 or 5 × 10ⁿ) covering `lo`..`hi`, about `count` of them. */
export function niceTicks(lo: number, hi: number, count = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  if (lo === hi) {
    const pad = Math.max(Math.abs(lo) * 0.1, 1);
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / Math.max(1, count - 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t < hi + step * 0.999; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks;
}

/**
 * Ticks for the running balance: fitted to the balance (a line needn't start
 * at zero), with zero brought in when the balance gets close to it.
 */
export function balanceTicks(values: number[]): number[] {
  if (!values.length) return [];
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // Head-room for the lowest-point label under its dot.
  const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 0.01, 1);
  if (lo > 0 && lo < (hi - lo) * 0.6) lo = 0;
  else lo -= pad;
  hi += pad / 3;
  return niceTicks(lo, hi, 5);
}
