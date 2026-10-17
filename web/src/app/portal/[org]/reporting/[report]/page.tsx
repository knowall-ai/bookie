import { notFound } from 'next/navigation';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { Report } from '@/lib/domain/types';
import {
  isReportId,
  REPORTS,
  resolveReportParams,
  type ReportSearchParams,
} from '@/lib/reports/catalog';
import { datePresets, rangePresets } from '@/lib/reports/periods';
import { todayIso } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState, ErrorPanel, NotAvailable } from '@/components/ui/States';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ReportTable } from '@/components/reports/ReportTable';
import { ReportControls } from '@/components/reports/ReportControls';
import { ReportActions } from '@/components/reports/ReportActions';

export async function generateMetadata({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  return { title: isReportId(report) ? REPORTS[report].title : 'Report' };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; report: string }>;
  searchParams: Promise<ReportSearchParams>;
}) {
  const [{ org: orgParam, report: reportParam }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  if (!isReportId(reportParam)) notFound();
  const { connector, base, org } = await orgContext(orgParam);
  const definition = REPORTS[reportParam];
  const crumbs = [{ label: 'Reporting', href: `${base}/reporting` }];

  if (!connector.reports) return <NotAvailable feature="Reports" source={sourceName(org)} />;
  if (!connector.reports.available.includes(definition.id)) {
    return (
      <>
        <PageHeader title={definition.title} crumbs={crumbs} />
        <NotAvailable feature={`The ${definition.title.toLowerCase()}`} source={sourceName(org)} />
      </>
    );
  }

  const details = await connector.organisation().catch(() => undefined);
  const fyEnd = { day: details?.financialYearEndDay, month: details?.financialYearEndMonth };
  const today = todayIso();
  const resolved = resolveReportParams(definition, search, today, fyEnd);

  let report: Report | undefined;
  let error: string | undefined;
  try {
    report = await connector.reports.run(definition.id, resolved);
  } catch (e) {
    if (!isConnectorError(e)) throw e;
    error = e.message;
  }

  const controls = {
    kind: definition.params,
    compare: definition.compare,
    value: resolved,
    rangePresets: rangePresets(today, fyEnd.day, fyEnd.month),
    datePresets: datePresets(today, fyEnd.day, fyEnd.month),
  };

  return (
    <>
      <PageHeader
        title={definition.title}
        crumbs={crumbs}
        actions={
          report && (
            <ReportActions
              report={report}
              fileParts={
                definition.params === 'range'
                  ? [resolved.from!, resolved.to!]
                  : [resolved.date ?? today]
              }
            />
          )
        }
      />
      <Card className="no-print mb-6 px-5 py-4">
        <ReportControls key={JSON.stringify(resolved)} {...controls} />
      </Card>
      {error ? (
        <ErrorPanel
          title={`${sourceName(org)} couldn't run this report`}
          message={error}
          action={
            <ButtonLink href={`${base}/reporting/${definition.id}`} size="sm">
              Reset options
            </ButtonLink>
          }
        />
      ) : report ? (
        <ReportTable report={report} />
      ) : (
        <EmptyState title="No report" />
      )}
    </>
  );
}
