'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import {
  FORECAST_HORIZONS,
  HORIZON_LABELS,
  PROJECTION_MONTHS,
  type ForecastHorizon,
  type ProjectionMonths,
} from '@/lib/forecast/types';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/ui/cn';

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className={cn(
        'border-line-strong bg-surface-2 flex rounded-lg border p-0.5 text-sm',
        disabled && 'opacity-50'
      )}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-3 py-1 whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface-3 text-ink shadow-sm' : 'text-muted hover:text-ink'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Horizon, currency and the optional layers. Everything lives in the URL, so a
 * forecast view can be shared and the server recomputes it from live data.
 */
export function ForecastControls({
  horizon,
  currency,
  currencies,
  drafts,
  pipeline,
  includePipeline,
  projectionMonths,
  projection,
}: {
  horizon: ForecastHorizon;
  currency: string;
  currencies: string[];
  drafts: boolean;
  includePipeline: boolean;
  pipeline: { available: boolean; reason?: string };
  projectionMonths?: ProjectionMonths;
  projection: { available: boolean; reason?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-busy={pending}>
      <Segmented
        label="Horizon"
        testId="forecast-horizon"
        value={horizon}
        options={FORECAST_HORIZONS.map((h) => ({ value: h, label: HORIZON_LABELS[h] }))}
        onChange={(h) => set({ horizon: h === '13w' ? undefined : h })}
      />
      {currencies.length > 1 && (
        <Segmented
          label="Currency"
          testId="forecast-currency"
          value={currency}
          options={currencies.map((c) => ({ value: c, label: c }))}
          onChange={(c) => set({ currency: c })}
        />
      )}
      <label className="text-body flex items-center gap-2.5 text-sm">
        <Toggle
          checked={drafts}
          label="Include drafts and awaiting approval"
          testId="forecast-drafts"
          onChange={(on) => set({ drafts: on ? '1' : undefined })}
        />
        <span aria-hidden>Include drafts and awaiting approval</span>
      </label>
      <div className="flex flex-wrap items-center gap-2.5 text-sm">
        <Toggle
          checked={!!projectionMonths}
          disabled={!projection.available}
          label="Add projected spending based on the last months"
          testId="forecast-projection"
          onChange={(on) => set({ projection: on ? String(projectionMonths ?? 3) : undefined })}
        />
        <span className={cn('text-body', !projection.available && 'opacity-60')} aria-hidden>
          Add projected spending based on the last
        </span>
        <Segmented
          label="Months to average"
          testId="forecast-projection-months"
          value={projectionMonths}
          disabled={!projection.available}
          options={PROJECTION_MONTHS.map((m) => ({ value: m, label: String(m) }))}
          onChange={(m) => set({ projection: String(m) })}
        />
        <span className={cn('text-body', !projection.available && 'opacity-60')} aria-hidden>
          months
        </span>
        {!projection.available && projection.reason && (
          <p className="text-faint basis-full text-xs" data-testid="forecast-projection-reason">
            Projection unavailable: {projection.reason}
          </p>
        )}
      </div>
      <div className="text-body text-sm" title={pipeline.reason}>
        <label className="flex items-center gap-2.5">
          <Toggle
            checked={includePipeline}
            disabled={!pipeline.available}
            label="Pipeline (weighted)"
            testId="forecast-pipeline"
            onChange={(on) => set({ pipeline: on ? '1' : undefined })}
          />
          <span aria-hidden>Pipeline (weighted)</span>
        </label>
        <p className="text-faint mt-1 text-xs">
          {pipeline.available
            ? 'Weighted by each opportunity’s chance of success, on its estimated closing date. When the client pays may differ.'
            : pipeline.reason}
        </p>
      </div>
      {pending && (
        <Loader2 className="text-muted h-4 w-4 animate-spin" aria-label="Updating the forecast" />
      )}
    </div>
  );
}
