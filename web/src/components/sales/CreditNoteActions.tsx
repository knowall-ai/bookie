'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Ban, Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { creditNoteAction } from '@/lib/portal/actions/credit-notes';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type Action = 'approve' | 'void' | 'delete';

const CONFIRM: Record<Action, { title: string; body: string; cta: string; danger?: boolean }> = {
  approve: {
    title: 'Approve this credit note?',
    body: 'It is posted to your accounts and its credit can then be allocated to an invoice. This writes to your live books.',
    cta: 'Approve',
  },
  void: {
    title: 'Void this credit note?',
    body: 'Voiding cannot be undone. The credit note stays on record as voided and its credit is no longer available.',
    cta: 'Void',
    danger: true,
  },
  delete: {
    title: 'Delete this draft?',
    body: 'The draft credit note will be removed from your accounting system.',
    cta: 'Delete',
    danger: true,
  },
};

const DONE: Record<Action, string> = {
  approve: 'Credit note approved',
  void: 'Credit note voided',
  delete: 'Credit note deleted',
};

export function CreditNoteActions({
  orgKey,
  id,
  listPath,
  editHref,
  can,
}: {
  orgKey: string;
  id: string;
  listPath: string;
  editHref?: string;
  can: Record<Action, boolean>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [more, setMore] = useState(false);

  const run = (action: Action) =>
    start(async () => {
      const result = await creditNoteAction(orgKey, id, action);
      setConfirm(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success(DONE[action]);
      if (action === 'delete') router.push(listPath);
      else router.refresh();
    });

  const menu = (['void', 'delete'] as const).filter((a) => can[a]);

  return (
    <div className="flex flex-wrap items-center gap-2">
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
              className="bg-surface-2 border-line-strong absolute right-0 z-30 mt-1 w-44 rounded-xl border p-1.5 shadow-xl"
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
                  {action === 'void' ? (
                    <>
                      <Ban className="h-4 w-4" /> Void
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
