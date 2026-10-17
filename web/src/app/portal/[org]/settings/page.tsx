import { ExternalLink, Users } from 'lucide-react';
import { orgContext, sourceName } from '@/lib/portal/context';
import { isConnectorError } from '@/lib/connectors/types';
import type { OrgDetails, OrgUser } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import {
  financialYearEndLabel,
  humanise,
  paymentTermLabel,
  ROLE_LABELS,
  salesTaxBasisLabel,
  salesTaxPeriodLabel,
} from '@/lib/portal/org-settings';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorPanel, NotAvailable } from '@/components/ui/States';

export const metadata = { title: 'Organisation settings' };

type Fact = { label: string; value: string | undefined };

/** A definition list that leaves out what the source didn't provide, and says so when empty. */
function Facts({ facts, source }: { facts: Fact[]; source: string }) {
  const shown = facts.filter((f): f is { label: string; value: string } => !!f.value);
  if (!shown.length) {
    return <p className="text-muted px-5 py-4 text-sm">Not available from {source}.</p>;
  }
  return (
    <dl className="divide-line/70 divide-y">
      {shown.map((f) => (
        <div key={f.label} className="grid gap-1 px-5 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="text-muted text-sm">{f.label}</dt>
          <dd className="text-ink text-sm whitespace-pre-line">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function addressText(details: OrgDetails): string | undefined {
  const a = details.address;
  if (!a) return undefined;
  return (
    [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(', '), a.postalCode, a.country]
      .filter(Boolean)
      .join('\n') || undefined
  );
}

const yesNo = (value: boolean | undefined) =>
  value === undefined ? undefined : value ? 'Yes' : 'No';

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgParam } = await params;
  const { connector, org } = await orgContext(orgParam);
  const source = sourceName(org);
  const crumbs = [{ label: 'Settings' }];

  const [details, users] = await Promise.all([
    connector.organisation(),
    connector.users
      ? connector.users.list().then(
          (list) => ({ list }),
          (error: unknown) => {
            if (!isConnectorError(error)) throw error;
            return { error: error.message };
          }
        )
      : undefined,
  ]);

  const organisation: Fact[] = [
    { label: 'Display name', value: details.name },
    { label: 'Legal or trading name', value: details.legalName },
    {
      label: 'Organisation type',
      value: details.organisationType && humanise(details.organisationType),
    },
    { label: 'Line of business', value: details.lineOfBusiness },
    { label: 'Company registration number', value: details.registrationNumber },
    { label: 'Address', value: addressText(details) },
    { label: 'Telephone', value: details.phone },
    { label: 'Country', value: details.country },
    { label: 'Time zone', value: details.timezone },
    {
      label: 'Plan',
      value:
        [details.plan && humanise(details.plan), details.edition && humanise(details.edition)]
          .filter(Boolean)
          .join(' · ') || undefined,
    },
    { label: 'Created', value: details.createdAt && formatDate(details.createdAt) },
    { label: 'Demo company', value: details.isDemoCompany ? 'Yes' : undefined },
  ];

  const financial: Fact[] = [
    {
      label: 'Financial year end',
      value: financialYearEndLabel(details.financialYearEndDay, details.financialYearEndMonth),
    },
    { label: 'Base currency', value: details.baseCurrency },
    {
      label: 'Lock date for all users except advisers',
      value: details.periodLockDate && formatDate(details.periodLockDate),
    },
    {
      label: 'Lock date for all users',
      value: details.endOfYearLockDate && formatDate(details.endOfYearLockDate),
    },
    {
      label: 'Invoice due date',
      value: details.paymentTerms?.sales && paymentTermLabel(details.paymentTerms.sales, 'invoice'),
    },
    {
      label: 'Bill due date',
      value: details.paymentTerms?.bills && paymentTermLabel(details.paymentTerms.bills, 'bill'),
    },
  ];

  const tax: Fact[] = [
    { label: 'VAT number', value: details.taxNumber },
    { label: 'Registered for VAT', value: yesNo(details.paysTax) },
    {
      label: 'VAT basis',
      value: details.salesTaxBasis && salesTaxBasisLabel(details.salesTaxBasis),
    },
    {
      label: 'VAT period',
      value: details.salesTaxPeriod && salesTaxPeriodLabel(details.salesTaxPeriod),
    },
    { label: 'Default amounts on sales', value: details.defaultSalesTax },
    { label: 'Default amounts on purchases', value: details.defaultPurchasesTax },
  ];

  const userColumns: Column<OrgUser>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (u) => (
        <span className="text-ink flex flex-wrap items-center gap-2 font-medium">
          {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '—'}
          {u.isSubscriber && <Badge tone="green">Subscriber</Badge>}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      cell: (u) => <span className="text-muted">{u.email ?? ''}</span>,
      hideOnMobile: true,
    },
    {
      key: 'role',
      header: 'Role',
      cell: (u) => (u.role ? (ROLE_LABELS[u.role] ?? humanise(u.role)) : '—'),
    },
    {
      key: 'updated',
      header: 'Last updated',
      cell: (u) => (u.updatedAt ? formatDate(u.updatedAt) : '—'),
      hideOnMobile: true,
    },
  ];

  return (
    <>
      <PageHeader
        title="Organisation settings"
        crumbs={crumbs}
        meta={`${details.name} · read-only from ${source}`}
        actions={
          details.sourceUrl && (
            <a
              href={details.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand-bright inline-flex items-center gap-1.5 text-sm hover:underline"
            >
              Open in {source} <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          )
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Organisation details" />
          <Facts facts={organisation} source={source} />
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Financial settings" />
            <Facts facts={financial} source={source} />
          </Card>
          <Card>
            <CardHeader title="Tax settings" />
            <Facts facts={tax} source={source} />
          </Card>
        </div>
      </div>

      <section aria-labelledby="users-heading" className="mt-8">
        <h2 id="users-heading" className="text-ink mb-3 text-lg font-semibold">
          Users
        </h2>
        {!users ? (
          <NotAvailable feature="The users list" source={source} />
        ) : 'error' in users ? (
          <ErrorPanel title={`${source} couldn't list users`} message={users.error} />
        ) : (
          <>
            <p className="text-muted mb-3 text-sm">
              {users.list.length} {users.list.length === 1 ? 'person has' : 'people have'} access.
              Invite people and change roles in {source}.
            </p>
            <DataTable
              columns={userColumns}
              rows={users.list}
              rowKey={(u) => u.id}
              empty={<EmptyState icon={<Users className="h-6 w-6" />} title="No users" />}
            />
          </>
        )}
      </section>
    </>
  );
}
