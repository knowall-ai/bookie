import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  crumbs,
  actions,
  meta,
}: {
  title: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav
            aria-label="Breadcrumb"
            className="text-muted mb-1.5 flex items-center gap-1 text-sm"
          >
            {crumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-brand-bright transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
                {i < crumbs.length - 1 && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-ink truncate text-2xl font-bold tracking-tight">{title}</h1>
        {meta && <div className="text-muted mt-1 text-sm">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
