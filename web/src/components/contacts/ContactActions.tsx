'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Archive, Pencil } from 'lucide-react';
import { archiveContact } from '@/lib/portal/actions/contacts';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function ContactActions({
  orgKey,
  id,
  name,
  source,
  editHref,
  canArchive,
}: {
  orgKey: string;
  id: string;
  name: string;
  source: string;
  editHref?: string;
  canArchive: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const archive = () =>
    start(async () => {
      const result = await archiveContact(orgKey, id);
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} archived`);
      router.refresh();
    });

  return (
    <div className="flex items-center gap-2">
      {editHref && (
        <ButtonLink href={editHref} size="sm">
          <Pencil className="h-4 w-4" /> Edit
        </ButtonLink>
      )}
      {canArchive && (
        <Button size="sm" variant="ghost" onClick={() => setConfirming(true)} disabled={pending}>
          <Archive className="h-4 w-4" /> Archive
        </Button>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Archive ${name}?`}
          body={
            <>
              The contact is hidden from your contact lists and can&rsquo;t be used on new
              documents. Its existing invoices and bills are kept. You can restore it in {source}.
              This writes to your live books.
            </>
          }
          cta="Archive"
          danger
          busy={pending}
          onCancel={() => setConfirming(false)}
          onConfirm={archive}
        />
      )}
    </div>
  );
}
