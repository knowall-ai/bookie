import { notFound } from 'next/navigation';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import { formatDate } from '@/lib/ui/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/Badge';
import { Money } from '@/components/ui/Money';
import { NotAvailable } from '@/components/ui/States';
import { DocumentFacts } from '@/components/documents/DocumentParts';
import { formatHours } from './format';

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <p className="text-faint text-xs font-semibold tracking-wide uppercase">{label}</p>
      <p className="text-ink mt-2 text-2xl font-semibold">{children}</p>
    </div>
  );
}

export async function ProjectDetailPage({ orgParam, id }: { orgParam: string; id: string }) {
  const { connector, base, org } = await orgContext(orgParam);
  if (!connector.projects) return <NotAvailable feature="Projects" source={sourceName(org)} />;
  const project = await connector.projects.get(decodeURIComponent(id)).catch((error) => {
    if (isConnectorError(error) && [400, 404].includes(error.status)) notFound();
    throw error;
  });

  const hasFinancials = [
    project.estimate,
    project.totalInvoiced,
    project.totalToInvoice,
    project.totalExpenses,
  ].some((v) => v !== undefined);
  const usedPercent =
    project.estimate && project.totalInvoiced !== undefined
      ? Math.min(100, Math.round((project.totalInvoiced / project.estimate) * 100))
      : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Projects', href: `${base}/projects` }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name}
            <StatusBadge status={project.status} />
          </span>
        }
      />
      {hasFinancials ? (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Tile label="Estimate">
            <Money amount={project.estimate} currency={project.currency} />
          </Tile>
          <Tile label="Invoiced">
            <Money amount={project.totalInvoiced} currency={project.currency} />
          </Tile>
          <Tile label="To invoice">
            <Money amount={project.totalToInvoice} currency={project.currency} />
          </Tile>
          <Tile label="Expenses">
            <Money amount={project.totalExpenses} currency={project.currency} />
          </Tile>
          <Tile label="Time logged">{formatHours(project.minutesLogged)}</Tile>
        </div>
      ) : (
        <p className="text-muted card mb-6 px-5 py-4 text-sm">
          {sourceName(org)} doesn&apos;t expose project financials, so only the project details are
          shown.
        </p>
      )}
      {usedPercent !== undefined && (
        <div className="card mb-6 p-5">
          <div className="text-muted mb-2 flex justify-between text-sm">
            <span>Invoiced against estimate</span>
            <span className="num text-ink">{usedPercent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Invoiced against estimate"
            aria-valuenow={usedPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="bg-surface-3 h-2 overflow-hidden rounded-full"
          >
            <div className="bg-brand h-full rounded-full" style={{ width: `${usedPercent}%` }} />
          </div>
        </div>
      )}
      <DocumentFacts
        facts={[
          { label: 'Contact', value: project.contact?.name ?? '—' },
          { label: 'Deadline', value: formatDate(project.deadline) },
          { label: 'Currency', value: project.currency ?? '—' },
          { label: 'Status', value: project.status === 'closed' ? 'Closed' : 'In progress' },
        ]}
      />
    </>
  );
}
