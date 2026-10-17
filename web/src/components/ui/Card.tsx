import { cn } from '@/lib/ui/cn';

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  subtitle,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('border-line flex items-start justify-between gap-4 border-b px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-ink truncate text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="text-muted mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
