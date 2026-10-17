'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import type { ReportParamKind } from '@/lib/reports/catalog';
import type { DatePreset, RangePreset, Timeframe } from '@/lib/reports/periods';

export interface ReportControlsProps {
  kind: ReportParamKind;
  compare: boolean;
  value: { from?: string; to?: string; date?: string; periods: number; timeframe: Timeframe };
  rangePresets: RangePreset[];
  datePresets: DatePreset[];
}

const TIMEFRAMES: { value: Timeframe; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

/** Date range / as-at pickers with Xero's presets, "Compare with", and Update. */
export function ReportControls({
  kind,
  compare,
  value,
  rangePresets,
  datePresets,
}: ReportControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(value.from ?? '');
  const [to, setTo] = useState(value.to ?? '');
  const [date, setDate] = useState(value.date ?? '');
  const [periods, setPeriods] = useState(value.periods);
  const [timeframe, setTimeframe] = useState<Timeframe>(value.timeframe);
  const id = useId();

  if (kind === 'today') {
    return (
      <p className="text-muted text-sm">
        Aged as at today, from what is outstanding in your books right now.
      </p>
    );
  }

  const rangePreset = rangePresets.find((p) => p.from === from && p.to === to)?.key ?? 'custom';
  const datePreset = datePresets.find((p) => p.date === date)?.key ?? 'custom';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = new URLSearchParams();
    if (kind === 'range') {
      if (from) query.set('from', from);
      if (to) query.set('to', to);
    } else if (date) {
      query.set('date', date);
    }
    if (compare && periods > 0) {
      query.set('periods', String(periods));
      query.set('timeframe', timeframe);
    }
    startTransition(() => router.push(`${pathname}?${query}`));
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label="Report options">
      {kind === 'range' ? (
        <>
          <Field label="Date range" htmlFor={`${id}-preset`} className="w-full sm:w-48">
            <Select
              id={`${id}-preset`}
              value={rangePreset}
              onChange={(e) => {
                const preset = rangePresets.find((p) => p.key === e.target.value);
                if (preset) {
                  setFrom(preset.from);
                  setTo(preset.to);
                }
              }}
            >
              {rangePresets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="From" htmlFor={`${id}-from`} className="w-[calc(50%-0.375rem)] sm:w-40">
            <Input
              id={`${id}-from`}
              type="date"
              required
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To" htmlFor={`${id}-to`} className="w-[calc(50%-0.375rem)] sm:w-40">
            <Input
              id={`${id}-to`}
              type="date"
              required
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field
            label={kind === 'month' ? 'Month ending' : 'As at'}
            htmlFor={`${id}-preset`}
            className="w-full sm:w-52"
          >
            <Select
              id={`${id}-preset`}
              value={datePreset}
              onChange={(e) => {
                const preset = datePresets.find((p) => p.key === e.target.value);
                if (preset) setDate(preset.date);
              }}
            >
              {datePresets.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </Select>
          </Field>
          <Field label="Date" htmlFor={`${id}-date`} className="w-full sm:w-40">
            <Input
              id={`${id}-date`}
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </>
      )}

      {compare && (
        <>
          <Field
            label="Compare with"
            htmlFor={`${id}-periods`}
            className="w-[calc(50%-0.375rem)] sm:w-52"
          >
            <Select
              id={`${id}-periods`}
              value={periods}
              onChange={(e) => setPeriods(Number(e.target.value))}
            >
              <option value={0}>None</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} previous {n === 1 ? 'period' : 'periods'}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Period"
            htmlFor={`${id}-timeframe`}
            className="w-[calc(50%-0.375rem)] sm:w-32"
          >
            <Select
              id={`${id}-timeframe`}
              value={timeframe}
              disabled={periods === 0}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      <Button type="submit" variant="primary" disabled={pending} className="w-full sm:w-auto">
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Update
      </Button>
    </form>
  );
}
