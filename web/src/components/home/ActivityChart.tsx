'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ActivityDay } from '@/lib/domain/types';
import {
  ACTIVITY_FILTERS,
  activityCount,
  activityLevel,
  activityTotal,
  activityWeeks,
  describeActivity,
  monthLabels,
  type ActivityFilter,
} from '@/lib/domain/activity';
import { cn } from '@/lib/ui/cn';

/** KnowAll greens, from "nothing" to "busiest day". */
const LEVEL_FILLS = [
  'var(--color-surface-3)',
  '#14532d',
  'var(--color-brand-deep)',
  'var(--color-brand)',
  'var(--color-brand-bright)',
];

const BLOCK = 11;
const GAP = 3;
const STEP = BLOCK + GAP;
const LEFT = 30; // weekday labels
const TOP = 18; // month labels
const WEEKDAYS: [number, string][] = [
  [0, 'Mon'],
  [2, 'Wed'],
  [4, 'Fri'],
];

const TOTAL_NOUN: Record<ActivityFilter, [string, string]> = {
  all: ['document or payment', 'documents and payments'],
  sales: ['invoice or quote', 'invoices and quotes'],
  purchases: ['bill', 'bills'],
  payments: ['payment', 'payments'],
};

interface Hover {
  day: ActivityDay;
  x: number;
  y: number;
}

/**
 * GitHub-style heatmap of the last 12 months of documents and payments, like
 * Zaplie's zap activity. Each active day links to that day's invoices (or
 * bills, when only bills were entered or the Purchases chip is on).
 */
export function ActivityChart({ days, base }: { days: ActivityDay[]; base: string }) {
  const router = useRouter();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [hover, setHover] = useState<Hover | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const weeks = useMemo(() => activityWeeks(days), [days]);
  const months = useMemo(() => monthLabels(weeks), [weeks]);
  const max = useMemo(
    () => Math.max(0, ...days.map((d) => activityCount(d, filter))),
    [days, filter]
  );
  const total = activityTotal(days, filter);

  // Phones show the most recent months first; older ones are a swipe away.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);

  const width = LEFT + weeks.length * STEP - GAP;
  const height = TOP + 7 * STEP - GAP;

  const hrefFor = (day: ActivityDay) => {
    const bills = filter === 'purchases' || (filter === 'all' && !day.sales && day.purchases > 0);
    return `${base}${bills ? '/purchases/bills' : '/sales/invoices'}?from=${day.date}&to=${day.date}`;
  };

  const show = (day: ActivityDay, target: Element) => {
    const box = frame.current?.getBoundingClientRect();
    const cell = target.getBoundingClientRect();
    if (!box) return;
    // Keep the tooltip inside the card near the edges.
    const x = Math.min(Math.max(cell.left + cell.width / 2 - box.left, 110), box.width - 110);
    setHover({ day, x, y: cell.top - box.top });
  };

  const [noun, nouns] = TOTAL_NOUN[filter];

  return (
    <section className="card" aria-labelledby="activity-heading" data-testid="activity-chart">
      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <h2 id="activity-heading" className="text-ink text-[15px] font-semibold">
          Activity
        </h2>
        <div role="group" aria-label="Show activity for" className="flex flex-wrap gap-1.5">
          {ACTIVITY_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                filter === f.value
                  ? 'border-brand/50 bg-brand/15 text-brand-bright'
                  : 'border-line text-muted hover:text-ink hover:border-line-strong'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={frame} className="relative px-5 pt-4 pb-3">
        <div ref={scroller} className="overflow-x-auto pb-1" onScroll={() => setHover(null)}>
          <svg
            role="group"
            aria-label={`Activity over the last 12 months: ${total} ${total === 1 ? noun : nouns}`}
            viewBox={`0 0 ${width} ${height}`}
            className="block h-auto w-full min-w-[700px]"
            onMouseLeave={() => setHover(null)}
          >
            {months.map((m) => (
              <text
                key={m.week}
                x={LEFT + m.week * STEP}
                y={10}
                className="fill-muted text-[9px]"
                aria-hidden="true"
              >
                {m.label}
              </text>
            ))}
            {WEEKDAYS.map(([row, label]) => (
              <text
                key={label}
                x={0}
                y={TOP + row * STEP + BLOCK - 2}
                className="fill-faint text-[9px]"
                aria-hidden="true"
              >
                {label}
              </text>
            ))}
            {weeks.map((week, w) =>
              week.map((day, d) => {
                if (!day) return null;
                const count = activityCount(day, filter);
                const rect = (
                  <rect
                    x={LEFT + w * STEP}
                    y={TOP + d * STEP}
                    width={BLOCK}
                    height={BLOCK}
                    rx={2.5}
                    style={{ fill: LEVEL_FILLS[activityLevel(count, max)] }}
                    data-date={day.date}
                    data-count={count}
                    onMouseEnter={(e) => show(day, e.currentTarget)}
                  />
                );
                if (!count) return <g key={day.date}>{rect}</g>;
                const href = hrefFor(day);
                return (
                  <a
                    key={day.date}
                    href={href}
                    aria-label={describeActivity(day, filter)}
                    className="focus-visible:outline-none [&:focus-visible>rect]:stroke-[var(--color-ink)] [&:focus-visible>rect]:stroke-[1.5]"
                    onFocus={(e) => show(day, e.currentTarget.firstElementChild ?? e.currentTarget)}
                    onBlur={() => setHover(null)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      router.push(href);
                    }}
                  >
                    {rect}
                  </a>
                );
              })
            )}
          </svg>
        </div>

        {hover && (
          <div
            role="tooltip"
            className="border-line-strong bg-surface-2 text-ink pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border px-2.5 py-1.5 text-xs whitespace-nowrap shadow-lg"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            {describeActivity(hover.day, filter)}
          </div>
        )}

        <div className="text-muted mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p>
            <span className="text-ink font-medium">{total.toLocaleString('en-GB')}</span>{' '}
            {total === 1 ? noun : nouns} in the last 12 months
          </p>
          <div className="flex items-center gap-1" aria-hidden="true">
            <span className="mr-1">Less</span>
            {LEVEL_FILLS.map((fill) => (
              <span
                key={fill}
                className="inline-block h-[11px] w-[11px] rounded-[2.5px]"
                style={{ background: fill }}
              />
            ))}
            <span className="ml-1">More</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ActivityChartSkeleton() {
  return (
    <div className="card" aria-busy="true" aria-label="Loading activity">
      <div className="border-line flex items-center justify-between border-b px-5 py-3.5">
        <span className="text-ink text-[15px] font-semibold">Activity</span>
      </div>
      <div className="animate-pulse px-5 pt-4 pb-3">
        <div className="bg-surface-2 h-[110px] w-full rounded-lg" />
        <div className="bg-surface-2 mt-3 h-3 w-56 rounded" />
      </div>
    </div>
  );
}
