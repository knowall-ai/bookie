'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';

export function MicrosoftLogo({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" className={className} aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

export function SignInButton({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn('azure-ad', { callbackUrl });
      }}
      className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white font-semibold text-[#1b1b1b] transition hover:bg-slate-100 disabled:opacity-70"
      data-testid="signin-microsoft"
    >
      <MicrosoftLogo className="h-5 w-5" />
      {busy ? 'Redirecting to Microsoft…' : 'Sign in with Microsoft'}
    </button>
  );
}

/** "Accountant or guest of KnowAll AI? Sign in to KnowAll AI": signs in to that host tenant. */
export function GuestSignIn({
  callbackUrl,
  providerId,
  name,
}: {
  callbackUrl: string;
  providerId: string;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <p className="text-muted mt-3 text-sm">
      Accountant or guest of {name}?{' '}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signIn(providerId, { callbackUrl });
        }}
        className="text-brand-bright font-medium hover:underline disabled:opacity-70"
        data-testid={`signin-${providerId}`}
      >
        {busy ? 'Redirecting to Microsoft…' : `Sign in to ${name}`}
      </button>
    </p>
  );
}
