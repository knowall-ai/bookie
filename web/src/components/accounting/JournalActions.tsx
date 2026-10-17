'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Ban, Check, RotateCcw, Trash2 } from 'lucide-react';
import type { JournalStatusChange } from '@/lib/domain/types';
import { journalStatusAction } from '@/lib/portal/actions/journals';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const CONFIRM: Record<
  JournalStatusChange,
  { title: string; body: string; cta: string; done: string; danger?: boolean }
> = {
  posted: {
    title: 'Post this journal?',
    body: 'It will be posted to your general ledger. This writes to your live books.',
    cta: 'Post',
    done: 'Journal posted',
  },
  voided: {
    title: 'Void this journal?',
    body: 'Its entries are reversed out of the ledger and it stays on record as voided. This cannot be undone.',
    cta: 'Void',
    done: 'Journal voided',
    danger: true,
  },
  deleted: {
    title: 'Delete this draft?',
    body: 'The draft journal will be removed from your accounting system.',
    cta: 'Delete',
    done: 'Draft deleted',
    danger: true,
  },
};

/** Post / delete a draft, void a posted journal, or start a reversing journal. */
export function JournalActions({
  orgKey,
  id,
  changes,
  reverseHref,
  listPath,
}: {
  orgKey: string;
  id: string;
  changes: JournalStatusChange[];
  reverseHref?: string;
  listPath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<JournalStatusChange | null>(null);

  const run = (change: JournalStatusChange) =>
    start(async () => {
      const result = await journalStatusAction(orgKey, id, change);
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(CONFIRM[change].done);
      if (change === 'deleted') router.push(listPath);
      else router.refresh();
    });

  if (!changes.length && !reverseHref) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {changes.includes('posted') && (
        <Button variant="primary" size="sm" onClick={() => setConfirm('posted')} disabled={pending}>
          <Check className="h-4 w-4" /> Post
        </Button>
      )}
      {reverseHref && (
        <ButtonLink href={reverseHref} size="sm">
          <RotateCcw className="h-4 w-4" /> Reverse
        </ButtonLink>
      )}
      {changes.includes('voided') && (
        <Button size="sm" variant="ghost" onClick={() => setConfirm('voided')} disabled={pending}>
          <Ban className="h-4 w-4" /> Void
        </Button>
      )}
      {changes.includes('deleted') && (
        <Button size="sm" variant="ghost" onClick={() => setConfirm('deleted')} disabled={pending}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
      {confirm && (
        <ConfirmDialog
          title={CONFIRM[confirm].title}
          body={CONFIRM[confirm].body}
          cta={CONFIRM[confirm].cta}
          danger={CONFIRM[confirm].danger}
          busy={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
    </div>
  );
}
