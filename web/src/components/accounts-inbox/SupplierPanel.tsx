'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { UserPlus, UserRoundCheck, UserRoundPen } from 'lucide-react';
import {
  createSupplierFromMail,
  updateSupplierFromMail,
} from '@/lib/portal/actions/accounts-inbox';
import { canUpdateFromMail } from '@/lib/accounts-inbox/contact-policy';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export interface SourcedValue {
  label: string;
  value: string;
  /** "from the PDF" or "from the sender". */
  source: string;
}

export interface DiffRow {
  field: string;
  label: string;
  current?: string;
  proposed: string;
}

type Props = {
  orgKey: string;
  messageId: string;
  attachmentId: string;
  source: string;
  trust: string;
} & (
  | { status: 'matched'; name: string; reason: string; diffs: DiffRow[]; canUpdate: boolean }
  | { status: 'several'; reason: string }
  | { status: 'none'; reason: string; proposed: SourcedValue[]; canCreate: boolean }
);

/** Who the document is from, how Bookie matched them, and proposed changes (each confirmed). */
export function SupplierPanel(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const diffs = props.status === 'matched' ? props.diffs : [];
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(diffs.filter((d) => canUpdateFromMail(d.field, props.trust)).map((d) => d.field))
  );

  const run = () =>
    start(async () => {
      if (props.status === 'none') {
        const result = await createSupplierFromMail(
          props.orgKey,
          props.messageId,
          props.attachmentId
        );
        setConfirming(false);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Added ${result.data.name} as a supplier`);
      } else {
        const result = await updateSupplierFromMail(
          props.orgKey,
          props.messageId,
          props.attachmentId,
          [...ticked]
        );
        setConfirming(false);
        if (!result.ok) return void toast.error(result.error);
        toast.success(`Updated ${result.data.updated.join(', ').toLowerCase()}`);
      }
      router.refresh();
    });

  return (
    <section className="card p-5" aria-labelledby="supplier-title" data-testid="supplier-panel">
      <h2 id="supplier-title" className="text-ink flex items-center gap-2 font-semibold">
        {props.status === 'matched' ? (
          <UserRoundCheck className="text-brand-bright h-4 w-4" aria-hidden />
        ) : props.status === 'none' ? (
          <UserPlus className="text-violet h-4 w-4" aria-hidden />
        ) : (
          <UserRoundPen className="text-warn h-4 w-4" aria-hidden />
        )}
        {props.status === 'matched'
          ? `Supplier: ${props.name}`
          : props.status === 'none'
            ? 'New supplier'
            : 'Several possible suppliers'}
      </h2>
      <p className="text-muted mt-1 text-sm">
        {props.reason}
        {props.status === 'several' && '. Choose the right one in the From field below.'}
      </p>

      {props.status === 'none' && (
        <>
          <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {props.proposed.map((p) => (
              <div key={p.label} className="contents">
                <dt className="text-muted">{p.label}</dt>
                <dd className="text-ink break-words">
                  {p.value} <span className="text-faint text-xs">({p.source})</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-faint mt-3 text-xs">
            Bank details are never copied from an invoice. Check them with the supplier by phone and
            add them in {props.source} yourself.
          </p>
          {props.canCreate && (
            <Button
              className="mt-4"
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={pending}
              data-testid="add-supplier"
            >
              <UserPlus className="h-4 w-4" /> Add supplier
            </Button>
          )}
        </>
      )}

      {props.status === 'matched' && diffs.length > 0 && (
        <div
          className="border-warn/30 bg-warn/5 mt-4 rounded-lg border p-4"
          data-testid="supplier-differs"
        >
          <h3 className="text-ink text-sm font-semibold">Supplier details differ</h3>
          <p className="text-muted mt-0.5 text-xs">
            The document prints these differently from {props.source}. Tick what to update; nothing
            changes until you confirm.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {diffs.map((d) => (
              <li key={d.field}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ticked.has(d.field)}
                    disabled={!props.canUpdate || !canUpdateFromMail(d.field, props.trust)}
                    onChange={(e) =>
                      setTicked((t) => {
                        const next = new Set(t);
                        if (e.target.checked) next.add(d.field);
                        else next.delete(d.field);
                        return next;
                      })
                    }
                    data-testid={`diff-${d.field}`}
                  />
                  <span className="min-w-0">
                    <span className="text-ink font-medium">{d.label}</span>
                    {!canUpdateFromMail(d.field, props.trust) && (
                      <span className="text-muted block text-xs">
                        Only from an email Exchange verified
                      </span>
                    )}
                    <span className="text-muted block break-words">
                      <span className="line-through decoration-1">{d.current ?? '(none)'}</span>
                      {' → '}
                      <span className="text-ink">{d.proposed}</span>
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {props.canUpdate && (
            <Button
              className="mt-3"
              variant="secondary"
              size="sm"
              disabled={pending || ticked.size === 0}
              onClick={() => setConfirming(true)}
              data-testid="update-supplier"
            >
              Update supplier
            </Button>
          )}
        </div>
      )}

      {confirming && (
        <ConfirmDialog
          title={props.status === 'none' ? 'Add this supplier?' : 'Update this supplier?'}
          body={
            props.status === 'none'
              ? `This adds a new contact to your live books in ${props.source}, with the details shown (no bank details).`
              : `This changes ${diffs
                  .filter((d) => ticked.has(d.field))
                  .map((d) => d.label.toLowerCase())
                  .join(
                    ', '
                  )} on ${props.status === 'matched' ? props.name : 'the supplier'} in ${props.source}. Bank details are not changed.`
          }
          cta={props.status === 'none' ? 'Add supplier' : 'Update supplier'}
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={run}
        />
      )}
    </section>
  );
}
