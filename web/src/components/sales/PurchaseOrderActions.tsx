'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, FileCheck, Send, Trash2 } from 'lucide-react';
import type { PurchaseOrderStatusChange } from '@/lib/domain/types';
import { setPurchaseOrderStatus } from '@/lib/portal/actions/purchase-orders';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const COPY: Record<
  PurchaseOrderStatusChange,
  { label: string; title: string; body: string; cta: string; done: string; danger?: boolean }
> = {
  submitted: {
    label: 'Submit for approval',
    title: 'Submit this purchase order for approval?',
    body: 'It moves to Awaiting approval in your accounting system. Nothing is sent to the supplier.',
    cta: 'Submit for approval',
    done: 'Purchase order submitted for approval',
  },
  authorised: {
    label: 'Approve',
    title: 'Approve this purchase order?',
    body: 'It moves to Approved in your accounting system and can then be billed.',
    cta: 'Approve',
    done: 'Purchase order approved',
  },
  billed: {
    label: 'Mark as billed',
    title: 'Mark this purchase order as billed?',
    body: 'Record that the supplier has billed for this order. No bill is created.',
    cta: 'Mark as billed',
    done: 'Purchase order marked as billed',
  },
  deleted: {
    label: 'Delete',
    title: 'Delete this purchase order?',
    body: 'The order will be removed from your accounting system.',
    cta: 'Delete',
    done: 'Purchase order deleted',
    danger: true,
  },
};

const ICON = { submitted: Send, authorised: Check, billed: FileCheck, deleted: Trash2 };

/** Status moves on a purchase order, each confirmed first: they write to live books. */
export function PurchaseOrderActions({
  orgKey,
  id,
  changes,
  listPath,
}: {
  orgKey: string;
  id: string;
  changes: PurchaseOrderStatusChange[];
  listPath: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<PurchaseOrderStatusChange | null>(null);
  if (changes.length === 0) return null;

  const run = (change: PurchaseOrderStatusChange) =>
    start(async () => {
      const result = await setPurchaseOrderStatus(orgKey, id, change);
      setConfirm(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(COPY[change].done);
      if (change === 'deleted') router.push(listPath);
      else router.refresh();
    });

  const primary = changes.find((c) => c !== 'deleted');
  return (
    <>
      {changes.map((change) => {
        const Icon = ICON[change];
        return (
          <Button
            key={change}
            size="sm"
            variant={change === 'deleted' ? 'danger' : change === primary ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={() => setConfirm(change)}
            data-testid={`po-${change}`}
          >
            <Icon className="h-4 w-4" /> {COPY[change].label}
          </Button>
        );
      })}
      {confirm && (
        <ConfirmDialog
          title={COPY[confirm].title}
          body={COPY[confirm].body}
          cta={COPY[confirm].cta}
          danger={COPY[confirm].danger}
          busy={pending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm)}
        />
      )}
    </>
  );
}
