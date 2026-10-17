'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { BookieAvatar } from './BookieAvatar';

const BookiePanel = dynamic(() => import('./BookiePanel').then((m) => m.BookiePanel), {
  ssr: false,
});

/** "Ask Bookie" button in the top bar; opens the chat and call panel. */
export function BookieLauncher({ orgKey, orgName }: { orgKey?: string; orgName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Bookie"
        title="Ask Bookie"
        data-testid="ask-bookie"
        className="border-brand/40 bg-brand/10 text-brand-bright hover:bg-brand/20 flex h-9 items-center gap-2 rounded-full border p-1 text-sm font-semibold transition-colors 2xl:pr-3"
      >
        <BookieAvatar className="h-7 w-7" />
        <span className="hidden whitespace-nowrap 2xl:inline">Ask Bookie</span>
      </button>
      {/* Portal: the sticky header's backdrop-filter would otherwise trap a fixed panel inside it. */}
      {open &&
        createPortal(
          <BookiePanel orgKey={orgKey} orgName={orgName} onClose={() => setOpen(false)} />,
          document.body
        )}
    </>
  );
}
