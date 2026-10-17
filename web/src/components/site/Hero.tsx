import { getImageProps } from 'next/image';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { cn } from '@/lib/ui/cn';
import { Container, display } from './ui';
import hero from '../../../public/bookie/hero.webp';
import portrait from '../../../public/bookie/portrait.webp';

const ALT =
  'Bookie, an ivory robot with gold trim, round gold-rimmed glasses and a green banker’s eyeshade, smiling at his desk over an open ledger in a sunlit study';

/**
 * The site is night; Bookie's study is sunlit. The hero treats his study as a
 * lit window in the dark page: a framed picture that bleeds off the right edge
 * on wide screens, with its warm light spilling onto the navy around it. The
 * copy stays on plain navy so the headline is always legible.
 *
 * Art direction: the landscape desk scene on wide screens, the portrait pose
 * (head and shoulders, holding a ledger) on phones. A <picture> loads only one.
 */
export function Hero() {
  const common = { alt: ALT, fill: true, fetchPriority: 'high', loading: 'eager' } as const;
  const {
    props: { srcSet: wide, sizes: wideSizes },
  } = getImageProps({ ...common, src: hero, sizes: '(min-width: 1024px) 60vw, 100vw' });
  const { props: narrow } = getImageProps({
    ...common,
    src: portrait,
    sizes: '(min-width: 640px) 80vw, 100vw',
  });

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
      <Container className="grid items-center gap-y-10 pt-6 pb-20 sm:pt-10 lg:min-h-[min(88svh,820px)] lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-x-12 lg:py-16 xl:grid-cols-[minmax(0,31rem)_minmax(0,1fr)] xl:gap-x-16">
        {/* The window onto his study. Small screens: above the copy. Large: right, to the edge. */}
        <div className="relative lg:order-2 lg:-mr-8 xl:mr-[calc(34rem-50vw)]">
          {/* Lamplight cast onto the night from the window. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-10 -z-10 rounded-[50%] bg-[radial-gradient(closest-side,rgb(255_200_90/0.22),rgb(212_166_74/0.08)_55%,transparent)] blur-2xl lg:-inset-x-24 lg:-inset-y-16"
          />
          <div className="relative aspect-square overflow-hidden rounded-[22px] bg-[#c9a77a] shadow-[0_30px_80px_-30px_rgb(255_190_90/0.35)] ring-1 ring-[#d4a64a]/45 sm:aspect-[3/2] lg:aspect-[6/5] lg:rounded-r-none">
            <picture>
              <source media="(min-width: 640px)" srcSet={wide} sizes={wideSizes} />
              {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
              <img
                {...narrow}
                className="object-cover object-[50%_12%] sm:object-[80%_40%] lg:object-[96%_40%]"
              />
            </picture>
            {/* A soft vignette: the edges of the window fall gently towards the night. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 shadow-[inset_0_0_90px_rgb(2_8_23/0.38)] lg:shadow-[inset_60px_0_90px_-30px_rgb(2_8_23/0.45),inset_0_0_80px_rgb(2_8_23/0.25)]"
            />
          </div>
        </div>

        <div className="lg:order-1">
          <h1
            id="hero-title"
            className={cn(
              display,
              'text-ink text-[2.65rem] leading-[1.02] font-medium tracking-[-0.025em] text-balance sm:text-6xl lg:text-[3.6rem] xl:text-[4.15rem]'
            )}
          >
            Clear books, and a bookkeeper who never clocks off.
          </h1>
          <p className="text-body mt-6 max-w-lg text-lg leading-relaxed text-pretty">
            Bookie puts a familiar, Xero-style portal over Xero or Business Central. Move between
            every client&rsquo;s books with one Microsoft sign-in, and ask Bookie, the AI
            bookkeeper, what the numbers mean, in the portal or on your Teams calls.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/install" className={buttonClass('primary', 'md', 'h-12 px-6 text-base')}>
              Get started
            </Link>
            <Link href="/#bookie" className={buttonClass('secondary', 'md', 'h-12 px-6 text-base')}>
              <PlayGlyph className="h-3.5 w-3.5 text-[#d4a64a]" />
              Meet Bookie
            </Link>
          </div>
          <p className="text-muted mt-6 text-sm">
            Open source under the MIT licence. Works with your existing Xero or Business Central
            subscription.
          </p>
        </div>
      </Container>
    </section>
  );
}

function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className={className} fill="currentColor">
      <path d="M3 1.6v8.8a.6.6 0 0 0 .9.5l7-4.4a.6.6 0 0 0 0-1L3.9 1.1a.6.6 0 0 0-.9.5z" />
    </svg>
  );
}
