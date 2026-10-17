'use client';

import { useEffect, useRef } from 'react';
import { Button } from './Button';

/**
 * Every write to a customer's live books goes through this dialog: the user
 * sees exactly what will happen and confirms it.
 */
export function ConfirmDialog({
  title,
  body,
  cta,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  cta: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="text-ink text-lg font-semibold">
          {title}
        </h2>
        <div className="text-muted mt-2 text-sm">{body}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
            data-testid="confirm-action"
          >
            {busy ? 'Working…' : cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
