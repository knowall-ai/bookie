import Link from 'next/link';
import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Clock3,
  Landmark,
  Scale,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { REPORT_GROUPS, REPORTS, type ReportGroup } from '@/lib/reports/catalog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { NotAvailable } from '@/components/ui/States';

export const metadata = { title: 'All reports' };

const ICONS: Record<ReportGroup, LucideIcon> = {
  'Financial performance': BarChart3,
  'Financial position': Scale,
  'Receivables and payables': Clock3,
  Bank: Landmark,
  Accounting: BookOpen,
};

export default async function ReportsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.reports) return <NotAvailable feature="Reports" source={sourceName(org)} />;

  const available = new Set(connector.reports.available);
  const missing = Object.values(REPORTS).filter((r) => !available.has(r.id));

  return (
    <>
      <PageHeader title="All reports" crumbs={[{ label: 'Reporting' }]} meta={org.name} />
      {connector.bank && connector.invoices && (
        <Link
          href={`${base}/reporting/cash-flow-forecast`}
          className="card hover:bg-surface-2 group mb-4 flex items-center justify-between gap-4 px-5 py-4 transition-colors"
        >
          <span className="flex min-w-0 items-center gap-3">
            <TrendingUp className="text-brand-bright h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="text-ink group-hover:text-brand-bright block font-medium transition-colors">
                Cash flow forecast
              </span>
              <span className="text-muted mt-0.5 block text-sm">
                Your bank balance over the next 13 weeks or 12 months, from unpaid invoices and
                bills and the items you plan
              </span>
            </span>
          </span>
          <ChevronRight className="text-faint h-4 w-4 shrink-0" aria-hidden />
        </Link>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {REPORT_GROUPS.map((group) => {
          const reports = connector.reports!.available.filter((id) => REPORTS[id].group === group);
          if (!reports.length) return null;
          const Icon = ICONS[group];
          return (
            <Card key={group}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Icon className="text-brand-bright h-4 w-4" aria-hidden />
                    {group}
                  </span>
                }
              />
              <ul className="p-2">
                {reports.map((id) => (
                  <li key={id}>
                    <Link
                      href={`${base}/reporting/${id}`}
                      className="hover:bg-surface-2 group flex items-center justify-between gap-4 rounded-lg px-3 py-3 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="text-ink group-hover:text-brand-bright block font-medium transition-colors">
                          {REPORTS[id].title}
                        </span>
                        <span className="text-muted mt-0.5 block text-sm">
                          {REPORTS[id].description}
                        </span>
                      </span>
                      <ChevronRight className="text-faint h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {missing.length > 0 && (
        <p className="text-faint mt-6 text-sm">
          Not available from {sourceName(org)}:{' '}
          {missing.map((r) => r.title.toLowerCase()).join(', ')}.
        </p>
      )}
    </>
  );
}
