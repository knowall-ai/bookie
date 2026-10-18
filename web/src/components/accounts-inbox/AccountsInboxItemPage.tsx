import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, Download, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { requireAuth } from '@/lib/auth/context';
import { orgContext, sourceName } from '@/lib/portal/context';
import { editorData } from '@/lib/portal/editor-data';
import { accountsMailbox, reviewOne, type InboxItem } from '@/lib/accounts-inbox/review';
import { proposedBill } from '@/lib/accounts-inbox/proposal';
import { newSupplierInput } from '@/lib/accounts-inbox/supplier';
import { formatAddress, type SupplierEvidence } from '@/lib/accounts-inbox/match';
import { createBillFromMail } from '@/lib/portal/actions/accounts-inbox';
import { isMailboxError } from '@/lib/mail/graph';
import { isConnectorError } from '@/lib/connectors/types';
import { accountsInboxFileUrl } from '@/lib/attachments';
import type { InvoiceInput } from '@/lib/domain/types';
import { formatDate } from '@/lib/ui/format';
import { Money } from '@/components/ui/Money';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorPanel } from '@/components/ui/States';
import { DocumentEditor, type EditorPayload } from '@/components/documents/DocumentEditor';
import { FilePreview } from '@/components/attachments/FilePreview';
import { MailboxNotSet } from './AccountsInboxPage';
import { SupplierPanel, type SourcedValue } from './SupplierPanel';
import { KIND_LABEL, reviewReasons, VerdictBadge, verdictDetail } from './verdict';

const SOURCE_LABEL = { document: 'from the PDF', sender: 'from the sender' } as const;

function sourced(evidence: SupplierEvidence): SourcedValue[] {
  const out: SourcedValue[] = [];
  const add = (label: string, e: { value: string; source: 'document' | 'sender' } | undefined) => {
    if (e?.value) out.push({ label, value: e.value, source: SOURCE_LABEL[e.source] });
  };
  add('Name', evidence.name);
  const address = formatAddress(evidence.address?.value ?? undefined);
  if (address) out.push({ label: 'Address', value: address, source: SOURCE_LABEL.document });
  add('VAT number', evidence.taxNumber);
  add('Company number', evidence.companyNumber);
  add('Email', evidence.email ?? evidence.senderAddress);
  add('Phone', evidence.phone);
  return out;
}

function TrustCard({ item }: { item: InboxItem }) {
  const Icon =
    item.trust.level === 'trusted'
      ? ShieldCheck
      : item.trust.level === 'suspicious'
        ? ShieldAlert
        : ShieldQuestion;
  return (
    <section className="card p-5" aria-labelledby="email-title">
      <h2 id="email-title" className="text-ink flex items-center gap-2 font-semibold">
        <Icon
          className={
            item.trust.level === 'trusted'
              ? 'text-brand-bright h-4 w-4'
              : item.trust.level === 'suspicious'
                ? 'text-danger h-4 w-4'
                : 'text-warn h-4 w-4'
          }
          aria-hidden
        />
        Is it genuine?{' '}
        <span className="text-muted font-normal">
          {item.trust.level === 'trusted'
            ? 'Authenticated, from a known contact'
            : item.trust.level === 'suspicious'
              ? 'Suspicious'
              : 'Unverified'}
        </span>
      </h2>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted">From</dt>
        <dd className="text-ink break-words">
          {item.fromName ? `${item.fromName} <${item.from ?? 'no address'}>` : item.from}
        </dd>
        <dt className="text-muted">Subject</dt>
        <dd className="text-ink break-words">{item.subject ?? '(none)'}</dd>
        {item.receivedAt && (
          <>
            <dt className="text-muted">Received</dt>
            <dd className="text-ink">{formatDate(item.receivedAt)}</dd>
          </>
        )}
      </dl>
      {item.trust.reasons.length > 0 && (
        <ul className="text-muted mt-3 list-disc space-y-0.5 pl-5 text-sm">
          {item.trust.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Reading({ item }: { item: InboxItem }) {
  const reading = item.reading;
  if (!reading) return null;
  const ex = reading.extraction;
  const row = (label: string, value: React.ReactNode) => (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink break-words">
        {value === null || value === undefined || value === false || value === '' ? (
          <span className="text-faint">Not printed</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
  return (
    <section className="card p-5" aria-labelledby="reading-title">
      <h2 id="reading-title" className="text-ink font-semibold">
        What the document says{' '}
        <span className="text-muted font-normal">({KIND_LABEL[ex.kind]})</span>
      </h2>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {row('Supplier', ex.supplier.name)}
        {row('Addressed to', ex.billTo.name)}
        {row('Invoice number', ex.invoiceNumber)}
        {row('Date', ex.invoiceDate && formatDate(ex.invoiceDate))}
        {row('Due', ex.dueDate && formatDate(ex.dueDate))}
        {row(
          'Currency',
          ex.currency ?? (ex.currencyAsPrinted && `Unclear ("${ex.currencyAsPrinted}")`)
        )}
        {row(
          'Net',
          ex.net !== null && <Money amount={ex.net} currency={ex.currency ?? undefined} />
        )}
        {row(
          'VAT',
          ex.vat !== null && <Money amount={ex.vat} currency={ex.currency ?? undefined} />
        )}
        {row(
          'Total',
          ex.total !== null && <Money amount={ex.total} currency={ex.currency ?? undefined} />
        )}
        {ex.poReference && row('PO reference', ex.poReference)}
      </dl>
      {reading.needsReview.length > 0 && (
        <div className="mt-3" data-testid="needs-review">
          <p className="text-warn text-sm font-medium">Needs review</p>
          <ul className="text-muted mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {reading.needsReview.map((n) => (
              <li key={`${n.field}:${n.reason}`}>
                <span className="text-body">{n.field}</span>: {n.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One document from the accounts mailbox: the checks, the supplier, and the proposed draft. */
export async function AccountsInboxItemPage({
  orgParam,
  messageId,
  attachmentId,
}: {
  orgParam: string;
  messageId: string;
  attachmentId: string;
}) {
  const auth = await requireAuth(`/portal/${orgParam}/purchases/accounts-inbox`);
  const { connector, base, org } = await orgContext(orgParam);
  const inbox = `${base}/purchases/accounts-inbox`;
  const crumbs = [
    { label: 'Purchases', href: `${base}/purchases` },
    { label: 'Accounts inbox', href: inbox },
  ];
  const setup = await accountsMailbox(auth);
  if (!setup.ok && setup.reason === 'not-set') return <MailboxNotSet crumbs={crumbs} />;
  if (!setup.ok)
    return (
      <>
        <PageHeader title="Accounts inbox" crumbs={crumbs} />
        <ErrorPanel title="Bookie couldn't read your settings" message={setup.message} />
      </>
    );
  const msgId = decodeURIComponent(messageId);
  const attId = decodeURIComponent(attachmentId);
  const result = await reviewOne(auth, setup.reader, connector, msgId, attId)
    .then((item) => ({ item }))
    .catch((error: unknown) => {
      if (isMailboxError(error) && error.status === 404) notFound();
      return {
        error:
          isMailboxError(error) || isConnectorError(error)
            ? error.message
            : 'The document could not be loaded.',
      };
    });
  if ('error' in result)
    return (
      <>
        <PageHeader title="Accounts inbox" crumbs={crumbs} />
        <ErrorPanel title={`Couldn't open ${setup.reader.mailbox}`} message={result.error} />
      </>
    );
  const item = result.item;
  if (!item) notFound();

  const source = sourceName(org);
  const v = item.verdict;
  const suspicious = v.kind === 'suspicious';
  const ex = item.reading?.extraction;
  const fileUrl = accountsInboxFileUrl(org.key, item.messageId, item.attachmentId);
  const canCreate = v.kind === 'new' && !!connector.invoices?.create;
  const canAttach =
    !!connector.attachments?.upload && connector.attachments.entities.includes('bill');

  let editor: React.ReactNode = null;
  if (canCreate && ex) {
    const data = await editorData(connector, 'purchase');
    const matched = item.supplier?.status === 'matched' ? item.supplier.contact : undefined;
    // Xero only flags a contact as a supplier once it has a bill: keep the match in the list.
    if (matched && !data.contacts.some((c) => c.value === matched.id))
      data.contacts.unshift({ value: matched.id, label: matched.name, currency: matched.currency });
    const proposal = proposedBill(ex, matched?.id);
    const orgKey = org.key;
    async function save(payload: EditorPayload) {
      'use server';
      return createBillFromMail(orgKey, msgId, attId, {
        ...payload,
        type: 'purchase',
        status: 'draft',
      } as InvoiceInput);
    }
    editor = (
      <div className="min-w-0 space-y-3" data-testid="proposed-bill">
        <div className="text-muted text-sm">
          <p>
            Bookie filled this in from the document. Check it, choose the account and tax rate for
            each line, then save it as a <strong className="text-ink">draft</strong>. Nothing is
            approved.
          </p>
          {proposal.notes.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {proposal.notes.map((n) => (
                <li key={`${n.field}:${n.reason}`}>{n.reason}</li>
              ))}
            </ul>
          )}
        </div>
        <DocumentEditor
          // Start again with the supplier preselected once it has been added or matched.
          key={matched?.id ?? 'no-supplier'}
          heading="Proposed draft bill"
          currency={data.baseCurrency}
          source={source}
          contactLabel="From"
          dateLabel="Date"
          secondDateLabel="Due date"
          numberLabel="Invoice number"
          docType="purchase"
          canApprove={false}
          initial={proposal.initial}
          save={save}
          cancelHref={inbox}
          savedHref={`${base}/purchases/bills`}
          confirmDraft={{
            title: 'Create this draft bill?',
            body: `This adds a DRAFT bill to your live books in ${source}${
              canAttach
                ? `, with ${item.fileName} attached`
                : `. ${source} can't take attachments here, so the email stays in the mailbox as the source`
            }. It is not approved.`,
            cta: 'Create draft bill',
          }}
          {...data}
        />
      </div>
    );
  }

  const supplierPanel =
    !suspicious && item.supplier && item.evidence ? (
      item.supplier.status === 'matched' ? (
        <SupplierPanel
          orgKey={org.key}
          messageId={item.messageId}
          attachmentId={item.attachmentId}
          source={source}
          status="matched"
          name={item.supplier.contact.name}
          reason={item.supplier.reason}
          diffs={(item.diffs ?? []).map(({ field, label, current, proposed }) => ({
            field,
            label,
            current,
            proposed,
          }))}
          canUpdate={!!connector.contacts?.update}
        />
      ) : item.supplier.status === 'several' ? (
        <SupplierPanel
          orgKey={org.key}
          messageId={item.messageId}
          attachmentId={item.attachmentId}
          source={source}
          status="several"
          reason={item.supplier.reason}
        />
      ) : (
        <SupplierPanel
          orgKey={org.key}
          messageId={item.messageId}
          attachmentId={item.attachmentId}
          source={source}
          status="none"
          reason={item.supplier.reason}
          proposed={sourced(item.evidence)}
          canCreate={
            v.kind === 'new' && !!connector.contacts?.create && !!newSupplierInput(item.evidence)
          }
        />
      )
    ) : null;

  const bank = item.bank;
  const reasons = v.kind === 'new' ? reviewReasons(item) : [];

  return (
    <>
      <PageHeader
        title={
          ex?.supplier.name && ex.invoiceNumber
            ? `${ex.supplier.name} ${ex.invoiceNumber}`
            : item.fileName
        }
        crumbs={crumbs}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <VerdictBadge item={item} />
            <span>{item.fileName}</span>
          </span>
        }
        actions={
          !suspicious ? (
            <a
              href={accountsInboxFileUrl(org.key, item.messageId, item.attachmentId, true)}
              download={item.fileName}
              className="text-body hover:bg-surface-2 hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          ) : undefined
        }
      />

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {suspicious && (
            <div
              role="alert"
              className="card border-danger/40 bg-danger/5 flex items-start gap-3 p-5"
              data-testid="suspicious-warning"
            >
              <AlertTriangle className="text-danger mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <div className="text-sm">
                <p className="text-ink font-semibold">⚠️ Don&apos;t pay or reply to this yet</p>
                <ul className="text-body mt-1 list-disc space-y-0.5 pl-5">
                  {v.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <p className="text-muted mt-2">
                  Bookie won&apos;t make a bill from it
                  {item.reading ? '' : ' or open its attachment'}. Check with the supplier using
                  contact details you already hold, not ones in the email.
                </p>
              </div>
            </div>
          )}

          {bank?.status === 'unknown' && !suspicious && (
            <div
              className="card border-warn/40 bg-warn/5 flex items-start gap-3 p-5 text-sm"
              role="note"
            >
              <AlertTriangle className="text-warn mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p className="text-body">
                ⚠️ This invoice gives bank details ({bank.printed}) that Bookie can&apos;t check
                against the supplier&apos;s record in {source}. Verify them by phone using a number
                you already hold, not the one on the invoice, before anyone pays it.
              </p>
            </div>
          )}

          {v.kind === 'in-books' && (
            <section className="card p-5 text-sm" data-testid="in-books">
              <p className="text-ink font-semibold">
                {v.match.status === 'same' ? 'Already in the books' : 'Different in the books'}
              </p>
              <p className="text-muted mt-1">{v.match.reason}.</p>
              <Link
                href={`${base}/purchases/bills/${encodeURIComponent(v.match.bill.id)}`}
                className="text-brand-bright mt-2 inline-block hover:underline"
              >
                Open bill {v.match.bill.number}
              </Link>
            </section>
          )}

          {(v.kind === 'not-invoice' || v.kind === 'unread') && (
            <section className="card p-5 text-sm">
              <p className="text-ink font-semibold">
                {v.kind === 'not-invoice'
                  ? `Not an invoice: ${KIND_LABEL[v.documentKind]}`
                  : "Bookie couldn't read this"}
              </p>
              <p className="text-muted mt-1">{verdictDetail(item)}</p>
            </section>
          )}

          {v.kind === 'new' && reasons.length > 0 && (
            <p className="text-warn text-sm">Needs review: {reasons.join('; ')}.</p>
          )}

          {supplierPanel}
          {editor}
        </div>

        <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-20 2xl:self-start">
          <TrustCard item={item} />
          <Reading item={item} />
          {!suspicious && (
            <div className="card p-4" aria-label="Source document">
              <p className="text-faint text-xs font-semibold tracking-wide uppercase">
                {canCreate && canAttach ? 'Attached to the draft' : 'The document'}
              </p>
              <p
                className="text-ink mt-0.5 mb-3 truncate text-sm font-medium"
                title={item.fileName}
              >
                {item.fileName}
              </p>
              <FilePreview src={fileUrl} fileName={item.fileName} contentType={item.contentType} />
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
