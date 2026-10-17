'use client';

import { X } from 'lucide-react';

/** Placeholder: replaced by the chat + call panel. */
export function BookiePanel({
  orgName,
  onClose,
}: {
  orgKey?: string;
  orgName?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="bg-canvas border-line h-full w-full max-w-md border-l p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted float-right"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-ink text-lg font-semibold">Bookie</h2>
        <p className="text-muted mt-2 text-sm">Ask about {orgName ?? 'your books'}.</p>
      </aside>
    </div>
  );
}
