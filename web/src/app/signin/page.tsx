import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth/context';
import { guestTenants } from '@/lib/auth/guest-tenants';
import { Logo } from '@/components/brand/Logo';
import { GuestSignIn, SignInButton } from './SignInButton';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

function safeCallback(url: string | undefined) {
  return url && url.startsWith('/') && !url.startsWith('//') ? url : '/portal';
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const target = safeCallback(callbackUrl);
  if (await getAuthContext()) redirect(target);

  return (
    <main className="grid-glow flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-md p-8 text-center">
        <Link href="/" className="inline-flex">
          <Logo size="lg" />
        </Link>
        <h1 className="text-ink mt-8 text-2xl font-bold tracking-tight">Sign in to your books</h1>
        <p className="text-muted mt-2 text-sm">
          Use your work Microsoft account. Bookie reads Xero and Business Central as you, and keeps
          your connection settings inside your own Microsoft 365.
        </p>
        {error && (
          <p
            role="alert"
            className="bg-danger/10 text-danger border-danger/30 mt-5 rounded-lg border px-3 py-2 text-sm"
          >
            {error === 'AccessDenied'
              ? 'Your organisation has not approved Bookie yet. Ask an administrator to install it.'
              : 'Sign-in did not complete. Please try again.'}
          </p>
        )}
        <SignInButton callbackUrl={target} />
        {guestTenants().map((t) => (
          <GuestSignIn
            key={t.providerId}
            callbackUrl={target}
            providerId={t.providerId}
            name={t.name}
          />
        ))}
        <p className="text-faint mt-6 text-xs">
          First time for your organisation?{' '}
          <Link href="/install" className="text-brand-bright hover:underline">
            An administrator can install Bookie
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
