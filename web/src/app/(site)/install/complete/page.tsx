import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { buttonClass } from '@/components/ui/Button';
import { Container, display } from '@/components/site/ui';
import { cn } from '@/lib/ui/cn';

export const metadata: Metadata = {
  title: 'Installation',
  robots: { index: false },
};

type Params = {
  admin_consent?: string;
  tenant?: string;
  error?: string;
  error_description?: string;
};

/** Microsoft's error descriptions carry trace ids and timestamps: keep the first sentence. */
function firstSentence(text: string | undefined) {
  if (!text) return undefined;
  const line = text.split(/\r?\n|Trace ID:/)[0].trim();
  return line.length > 240 ? `${line.slice(0, 240)}…` : line;
}

export default async function InstallComplete({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const ok = p.admin_consent?.toLowerCase() === 'true' && !p.error;
  const declined = p.error === 'access_denied';

  return (
    <div className="grid-glow">
      <Container className="flex min-h-[70vh] flex-col items-center justify-center py-24 text-center">
        {ok ? (
          <>
            <Image
              src="/bookie/avatar.png"
              alt=""
              width={112}
              height={112}
              className="ring-brand/50 rounded-full ring-2"
            />
            <h1
              className={cn(
                display,
                'text-ink mt-8 text-4xl font-medium tracking-[-0.02em] text-balance sm:text-5xl'
              )}
            >
              Bookie is installed. Thank you.
            </h1>
            <p className="text-body mt-5 max-w-xl text-lg leading-relaxed">
              Everyone in your organisation can now sign in with their work account. Next, open the
              portal and connect Xero, or switch on Business Central.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/portal" className={buttonClass('primary', 'md', 'h-12 px-6 text-base')}>
                Open the portal
              </Link>
              <Link
                href="/security"
                className={buttonClass('secondary', 'md', 'h-12 px-6 text-base')}
              >
                How Bookie handles data
              </Link>
            </div>
          </>
        ) : (
          <>
            <CircleAlert aria-hidden="true" className="text-warn h-12 w-12" />
            <h1
              className={cn(
                display,
                'text-ink mt-6 text-4xl font-medium tracking-[-0.02em] text-balance sm:text-5xl'
              )}
            >
              {declined ? 'Installation was cancelled' : 'Bookie was not installed'}
            </h1>
            <p className="text-body mt-5 max-w-xl text-lg leading-relaxed">
              {declined
                ? 'The permissions were not accepted, so nothing has changed in your organisation. You can start again whenever you are ready.'
                : 'Microsoft did not confirm the installation. Make sure you sign in as a Global Administrator, Cloud Application Administrator or Application Administrator, then try again.'}
            </p>
            {p.error && !declined && (
              <p
                role="alert"
                className="border-danger/30 bg-danger/10 text-danger mt-6 max-w-xl rounded-lg border px-4 py-3 text-left text-sm"
              >
                <span className="font-semibold">{p.error}</span>
                {firstSentence(p.error_description) && `: ${firstSentence(p.error_description)}`}
              </p>
            )}
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/install" className={buttonClass('primary', 'md', 'h-12 px-6 text-base')}>
                Try again
              </Link>
              <Link href="/" className={buttonClass('secondary', 'md', 'h-12 px-6 text-base')}>
                Back to home
              </Link>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
