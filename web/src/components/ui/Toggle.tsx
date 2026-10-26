'use client';

import { cn } from '@/lib/ui/cn';

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  testId,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50',
        checked ? 'bg-brand border-brand' : 'bg-surface-3 border-line-strong'
      )}
    >
      <span
        className={cn(
          'inline-block h-4.5 w-4.5 rounded-full shadow transition-transform',
          checked ? 'bg-brand-ink translate-x-5.5' : 'translate-x-1 bg-white'
        )}
      />
    </button>
  );
}
