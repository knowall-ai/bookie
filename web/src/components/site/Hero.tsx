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
 * Bookie in his study, full bleed behind the headline and under the header,
 * darkened towards the copy as on the sign-in page: on wide screens a
 * left-to-right fall into the night, on small screens the picture sits above
 * the copy and fades into the night beneath it.
 *
 * Art direction: the landscape desk scene from 640px up, the portrait pose
 * (head and shoulders, holding a ledger) on phones. A <picture> loads only one.
 */
export function Hero() {
  const common = { alt: ALT, fill: true, fetchPriority: 'high', loading: 'eager' } as const;
  const {
    props: { srcSet: wide, sizes: wideSizes },
  } = getImageProps({ ...common, src: hero, sizes: '100vw' });
  const { props: narrow } = getImageProps({ ...common, src: portrait, sizes: '100vw' });

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate -mt-16 flex overflow-hidden pt-16 lg:min-h-[min(92svh,860px)] lg:items-center"
    >
      {/* Small screens: the picture sits above the copy. Large: full bleed behind it. */}
      <div className="bg-night absolute inset-x-0 top-0 -z-20 h-[min(118vw,620px)] lg:inset-0 lg:h-auto">
        <picture>
          <source media="(min-width: 640px)" srcSet={wide} sizes={wideSizes} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
          <img
            {...narrow}
            className="object-cover object-[50%_10%] sm:object-[85%_30%] lg:object-[70%_35%]"
          />
        </picture>
        {/* Legibility: the picture falls into the night on the copy's side. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(180deg,rgb(2_8_23/0.25)_0%,rgb(2_8_23/0.2)_40%,rgb(2_8_23/0.9)_74%,rgb(2_8_23)_88%)] lg:bg-[linear-gradient(90deg,rgb(2_8_23/0.97)_0%,rgb(2_8_23/0.93)_38%,rgb(2_8_23/0.7)_54%,rgb(2_8_23/0.25)_72%,rgb(2_8_23/0.1)_100%)]"
        />
        {/* The header sits on the picture: shade its top edge, and fade the foot into the page. */}
        <div
          aria-hidden="true"
          className="from-night/60 absolute inset-x-0 top-0 h-28 bg-gradient-to-b to-transparent"
        />
        <div
          aria-hidden="true"
          className="from-night absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t to-transparent"
        />
      </div>

      <Container className="pt-[min(92vw,500px)] pb-16 lg:py-24">
        <div className="max-w-xl">
          <h1
            id="hero-title"
            className={cn(
              display,
              'text-ink text-[2.65rem] leading-[1.02] font-medium tracking-[-0.025em] text-balance sm:text-6xl lg:text-[4.6rem]'
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
            <Link
              href="/#bookie"
              className={buttonClass('secondary', 'md', 'bg-night/60 h-12 px-6 text-base')}
            >
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
