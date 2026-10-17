import type { Metadata } from 'next';
import { Newsreader } from 'next/font/google';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { PublicBookieLauncher } from '@/components/public-bookie/PublicBookieLauncher';

/** Display serif for the public site only: a printed-ledger voice for headlines. */
const display = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  axes: ['opsz'],
});

export const metadata: Metadata = {
  openGraph: {
    siteName: 'Bookie',
    type: 'website',
    images: [{ url: '/og-bookie.jpg', width: 1200, height: 630, alt: 'Bookie, the AI bookkeeper' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og-bookie.jpg'] },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} flex min-h-dvh flex-col`}>
      <a
        href="#main"
        className="bg-brand text-brand-ink sr-only z-50 rounded-md px-3 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1 overflow-x-clip">
        {children}
      </main>
      <SiteFooter />
      {/* Bookie's public helper: product questions only, no access to any books. */}
      <PublicBookieLauncher />
    </div>
  );
}
