'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  Check,
  Download,
  FileOutput,
  MoreHorizontal,
  Pencil,
  Send,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { convertQuoteToInvoice, setQuoteStatus } from '@/lib/portal/actions/quotes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export type QuoteAction = 'sent' | 'accepted' | 'declined' | 'deleted' | 'convert';

const CONFIRM: Record<QuoteAction, { title: string; body: string; cta: string; danger?: boolean }> =
  {
    sent: {
      title: 'Mark this quote as sent?',
      body: 'The quote moves to Sent in your accounting system. Nothing is emailed to the customer.',
      cta: 'Mark as sent',
    },
    accepted: {
      title: 'Mark this quote as accepted?',
      body: 'Record that the customer has accepted the quote. You can then turn it into an invoice.',
      cta: 'Mark as accepted',
    },
    declined: {
      title: 'Mark this quote as declined?',
      body: 'Record that the customer turned the quote down.',
      cta: 'Mark as declined',
      danger: true,
    },
    deleted: {
      title: 'Delete this quote?',
      body: 'The quote will be removed from your accounting system.',
      cta: 'Delete',
      danger: true,
    },
    convert: {
      title: 'Create an invoice from this quote?',
      body: 'A draft invoice is created with the quote’s customer and lines, and the quote is marked as invoiced. This writes to your live books.',
      cta: 'Create invoice',
    },
  };

const DONE: Record<QuoteAction, string> = {
  sent: 'Quote marked as sent',
  accepted: 'Quote marked as accepted',
  declined: 'Quote marked as declined',
  deleted: 'Quote deleted',
  convert: 'Draft invoice created',
};

export function QuoteActions({
  orgKey,
  id,
  listPath,
  invoicesPath,
  editHref,
  pdfHref,
  can,
}: {
  orgKey: string;
  id: string;
  listPath: string;
  invoicesPath: string;
  editHref?: string;
  pdfHref?: string;
  can: Record<QuoteAction, boolean>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<QuoteAction | null>(null);
  const [more, setMore] = useState(false);

  const run = (action: QuoteAction) =>
    start(async () => {
      if (action === 'convert') {
        const result = await convertQuoteToInvoice(orgKey, id);
        setConfirm(null);
        if (!result.ok) return void toast.error(result.error);
        toast.success(DONE.convert);
        router.push(
          result.data.invoiceId
            ? `${invoicesPath}/${encodeURIComponent(result.data.invoiceId)}`
            : `${invoicesPath}?status=draft`
        );
        return;
      }
      const result = await setQuoteStatus(orgKey, id, action);
      setConfirm(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success(DONE[action]);
      if (action === 'deleted') router.push(listPath);
      else router.refresh();
    });

  const menu = (['declined', 'deleted'] as const).filter((a) => can[a]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.convert && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setConfirm('convert')}
          disabled={pending}
        >
          <FileOutput className="h-4 w-4" /> Create invoice
        </Button>
      )}
      {can.sent && (
        <Button
          variant={can.convert ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => setConfirm('sent')}
          disabled={pending}
        >
          <Send className="h-4 w-4" /> Mark as sent
        </Button>
      )}
      {can.accepted && (
        <Button size="sm" onClick={() => setConfirm('accepted')} disabled={pending}>
          <Check className="h-4 w-4" /> Mark as accepted
        </Button>
      )}
      {editHref && (
        <ButtonLink href={editHref} size="sm">
          <Pencil className="h-4 w-4" /> Edit
        </ButtonLink>
      )}
      {pdfHref && (
        <a href={pdfHref} className="hidden sm:inline-flex">
          <Button size="sm" variant="ghost" tabIndex={-1}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </a>
      )}
      {menu.length > 0 && (
        <div className="relative">
          <Button
            size="sm"
            variant="ghost"
            aria-label="More actions"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {more && (
            <div
              role="menu"
              className="bg-surface-2 border-line-strong absolute right-0 z-30 mt-1 w-48 rounded-xl border p-1.5 shadow-xl"
            >
              {menu.map((action) => (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMore(false);
                    setConfirm(action);
                  }}
                  className="text-danger hover:bg-danger/10 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  {action === 'declined' ? (
                    <>
                      <ThumbsDown className="h-4 w-4" /> Mark as declined
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4" /> Delete
                    </>
                  )}
                </button>
              ))}
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
