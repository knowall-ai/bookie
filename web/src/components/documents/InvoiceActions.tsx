'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Download, Mail, MoreHorizontal, Pencil, Ban, Trash2 } from 'lucide-react';
import { invoiceAction } from '@/lib/portal/actions/invoices';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type Action = 'approve' | 'void' | 'delete' | 'email';

const CONFIRM: Record<Action, { title: string; body: string; cta: string; danger?: boolean }> = {
  approve: {
    title: 'Approve this document?',
    body: 'It will be posted to your accounts and become awaiting payment. This writes to your live books.',
    cta: 'Approve',
  },
  email: {
    title: 'Email this invoice?',
    body: 'Your accounting system will email it to the contact using its template.',
    cta: 'Send email',
  },
  void: {
    title: 'Void this document?',
    body: 'Voiding cannot be undone. The document stays on record as voided.',
    cta: 'Void',
    danger: true,
  },
  delete: {
    title: 'Delete this draft?',
    body: 'The draft will be removed from your accounting system.',
    cta: 'Delete',
    danger: true,
  },
};

export function InvoiceActions({
  orgKey,
  id,
  noun,
  listPath,
  editHref,
  pdfHref,
  can,
}: {
  orgKey: string;
  id: string;
  noun: string;
  listPath: string;
  editHref?: string;
  pdfHref: string;
  can: Record<Action | 'pdf', boolean>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [more, setMore] = useState(false);

  const run = (action: Action) =>
    start(async () => {
      const result = await invoiceAction(orgKey, id, action);
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        {
          approve: `${noun} approved`,
          void: `${noun} voided`,
          delete: `${noun} deleted`,
          email: `${noun} emailed`,
        }[action]
      );
      if (action === 'delete') router.push(listPath);
      else router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      {can.approve && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setConfirm('approve')}
          disabled={pending}
        >
          <Check className="h-4 w-4" /> Approve
        </Button>
      )}
      {editHref && (
        <ButtonLink href={editHref} size="sm">
          <Pencil className="h-4 w-4" /> Edit
        </ButtonLink>
      )}
      {can.email && (
        <Button size="sm" onClick={() => setConfirm('email')} disabled={pending}>
          <Mail className="h-4 w-4" /> Email
        </Button>
      )}
      {can.pdf && (
        <a href={pdfHref} className="hidden sm:inline-flex">
          <Button size="sm" variant="ghost" tabIndex={-1}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </a>
      )}
      {(can.void || can.delete) && (
        <div className="relative">
          <Button
            size="sm"
            variant="ghost"
            aria-label="More actions"
            onClick={() => setMore(!more)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {more && (
            <div className="bg-surface-2 border-line-strong absolute right-0 z-30 mt-1 w-44 rounded-xl border p-1.5 shadow-xl">
              {can.void && (
                <button
                  type="button"
                  onClick={() => {
                    setMore(false);
                    setConfirm('void');
                  }}
                  className="text-danger hover:bg-danger/10 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <Ban className="h-4 w-4" /> Void
                </button>
              )}
              {can.delete && (
                <button
                  type="button"
                  onClick={() => {
                    setMore(false);
                    setConfirm('delete');
                  }}
                  className="text-danger hover:bg-danger/10 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          {...CONFIRM[confirm]}
          busy={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
    </div>
  );
}
