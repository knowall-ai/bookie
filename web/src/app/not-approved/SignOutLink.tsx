'use client';

import { signOut } from 'next-auth/react';

export function SignOutLink() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/' })}
      className="text-muted hover:text-ink text-sm underline underline-offset-4"
      data-testid="not-approved-sign-out"
    >
      Sign out
    </button>
  );
}
