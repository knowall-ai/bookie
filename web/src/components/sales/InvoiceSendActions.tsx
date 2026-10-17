'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, ExternalLink, Link2, Send, X } from 'lucide-react';
import { getOnlineInvoiceUrl, markInvoiceSent } from '@/lib/portal/actions/invoice-extras';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inputClass } from '@/components/ui/Field';
import { cn } from '@/lib/ui/cn';

/** Xero's "Mark as sent" and online invoice "Copy link", for approved sales invoices. */
export function InvoiceSendActions({
  orgKey,
  invoiceId,
  canMarkSent,
  canCopyLink,
}: {
  orgKey: string;
  invoiceId: string;
  canMarkSent: boolean;
  canCopyLink: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Online invoice link copied');
    } catch {
      // Clipboard can be blocked; the link stays visible to copy by hand.
      setCopied(false);
    }
  };

  const copyLink = () =>
    start(async () => {
      if (url) return void (await copy(url));
      const result = await getOnlineInvoiceUrl(orgKey, invoiceId);
      if (!result.ok) return void toast.error(result.error);
      setUrl(result.data.url);
      await copy(result.data.url);
    });

  const markSent = () =>
    start(async () => {
      const result = await markInvoiceSent(orgKey, invoiceId);
      setConfirming(false);
      if (!result.ok) return void toast.error(result.error);
      toast.success('Invoice marked as sent');
      router.refresh();
    });

  return (
    <>
      {canMarkSent && (
        <Button size="sm" onClick={() => setConfirming(true)} disabled={pending}>
          <Send className="h-4 w-4" /> Mark as sent
        </Button>
      )}
      {canCopyLink && (
        <div className="relative">
          <Button size="sm" onClick={copyLink} disabled={pending} data-testid="copy-online-link">
            {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />} Copy link
          </Button>
          {url && (
            <div
              role="dialog"
              aria-label="Online invoice link"
              className="bg-surface-2 border-line-strong absolute right-0 z-30 mt-1 w-[min(22rem,80vw)] rounded-xl border p-3 shadow-xl"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-ink text-sm font-semibold">Online invoice</p>
                <button
                  type="button"
                  aria-label="Close"
                  className="text-faint hover:text-ink"
                  onClick={() => setUrl(null)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                readOnly
                aria-label="Online invoice link"
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className={cn(inputClass, 'h-9 text-xs')}
                data-testid="online-link"
              />
              <div className="mt-2 flex justify-end gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-brand-bright inline-flex items-center gap-1 text-sm hover:underline"
                >
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title="Mark this invoice as sent?"
          body="The invoice is flagged as sent in your accounting system. Nothing is emailed to the customer."
          cta="Mark as sent"
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={markSent}
        />
      )}
    </>
  );
}
