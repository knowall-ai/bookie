import { forwardRef } from 'react';
import { cn } from '@/lib/ui/cn';

export const inputClass =
  'bg-surface border-line-strong text-ink placeholder:text-faint focus:border-brand h-10 w-full rounded-lg border px-3 text-sm outline-none disabled:opacity-60';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-body text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-danger text-xs">{error}</p> : hint ? <p className="text-faint text-xs">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(inputClass, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select ref={ref} className={cn(inputClass, 'pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputClass, 'h-auto min-h-20 py-2', className)} {...props} />;
  }
);
