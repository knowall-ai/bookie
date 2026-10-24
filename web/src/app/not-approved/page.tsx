import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mail } from 'lucide-react';
import { getSignIn, isApprovedSignIn } from '@/lib/auth/context';
import { ACCESS_REQUEST_EMAIL, accessRequestMailto } from '@/lib/auth/access-request';
import { guestTenants } from '@/lib/auth/guest-tenants';
import { tenantDisplayName } from '@/lib/auth/tenant-name';
import { Logo } from '@/components/brand/Logo';
import { GuestSignIn } from '@/app/signin/SignInButton';
import { SignOutLink } from './SignOutLink';

export const metadata = { title: 'Not set up yet', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * Shown to someone who signed in from an organisation KnowAll hasn't approved
 * (`lib/auth/approved-tenants.ts`). No app data and no navigation: just who
 * they signed in as, and two ways to ask for access.
 */
export default async function NotApprovedPage() {
  const auth = await getSignIn();
  if (!auth) redirect('/signin');
  if (isApprovedSignIn(auth)) redirect('/portal');

  const organisation = await tenantDisplayName(auth);
  const { tenantId, email } = auth.user;
  const mailto = accessRequestMailto({ organisation, tenantId, email });

  return (
    <main
      className="signin-hero flex min-h-dvh items-end px-5 pt-[42vh] pb-10 min-[900px]:items-center min-[900px]:py-16 min-[900px]:pl-[max(6vw,40px)]"
      data-testid="not-approved"
    >
      <div className="w-full max-w-xl">
        {/* On a phone Bookie's own face is the brand; the logo would sit on it. */}
        <Link href="/" className="hidden min-[900px]:inline-flex">
          <Logo size="lg" />
        </Link>
        <h1 className="text-ink text-3xl leading-tight font-bold tracking-tight text-balance min-[900px]:mt-8 sm:text-5xl">
          Your organisation isn’t set up on Bookie yet.
        </h1>
        <p className="text-body mt-4 text-base sm:text-lg">
          Bookie is open to organisations KnowAll AI has approved. Get in touch and we’ll set yours
          up.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <a
            href={mailto}
            className="bg-brand text-brand-ink hover:bg-brand-bright inline-flex h-12 items-center gap-2 rounded-xl px-6 font-semibold shadow-[var(--shadow-glow)] transition"
            data-testid="request-access"
          >
            <Mail className="h-5 w-5" aria-hidden="true" />
            Request access
          </a>
          <p className="text-sm text-white sm:text-base">
            Or email us at{' '}
            <a
              href={`mailto:${ACCESS_REQUEST_EMAIL}`}
              className="hover:text-brand-bright font-semibold text-white underline underline-offset-4"
              data-testid="email-us"
            >
              {ACCESS_REQUEST_EMAIL}
            </a>
          </p>
        </div>

        <dl
          className="text-faint mt-8 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs"
          data-testid="not-approved-details"
        >
          <dt>Signed in as</dt>
          <dd className="text-muted break-all">{email || 'Not known'}</dd>
          <dt>Organisation</dt>
          <dd className="text-muted">{organisation || 'Not known'}</dd>
          <dt>Tenant ID</dt>
          <dd className="text-muted font-mono break-all">{tenantId || 'Not known'}</dd>
        </dl>

        {guestTenants().map((t) => (
          <GuestSignIn
            key={t.providerId}
            callbackUrl="/portal"
            providerId={t.providerId}
            name={t.name}
          />
        ))}

        <div className="mt-6">
          <SignOutLink />
        </div>
      </div>
    </main>
  );
}
