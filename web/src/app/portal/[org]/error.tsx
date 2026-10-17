'use client';

import { ErrorPanel } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

/** Friendly failure for any page inside an org (a source outage, a revoked connection...). */
export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Bookie could not load this from your accounting system. It may be busy or the connection may need attention in Settings.'
      : error.message;
  return (
    <div className="mx-auto max-w-2xl py-10">
      <ErrorPanel
        title="We couldn't load this page"
        message={message}
        action={
          <Button size="sm" variant="secondary" onClick={reset}>
            Try again
          </Button>
        }
      />
    </div>
  );
}
