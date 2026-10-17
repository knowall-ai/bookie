import Image from 'next/image';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { cn } from '@/lib/ui/cn';
import { Container, display } from './ui';
import hero from '../../../public/bookie/hero.webp';

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate -mt-16 flex overflow-hidden pt-16 lg:min-h-[min(92svh,860px)] lg:items-center"
    >
      {/* Small screens: the image sits above the copy. Large: full-bleed behind it. */}
      <div className="absolute inset-x-0 top-0 -z-20 h-[min(118vw,620px)] lg:inset-0 lg:h-auto">
        <Image
          src={hero}
          alt="Bookie, a weathered gunmetal robot with glowing green eyes and a green banker's visor, holding a ledger and a fountain pen"
          priority
          fill
          placeholder="blur"
          sizes="100vw"
          className="object-cover object-[80%_top] sm:object-[85%_15%] lg:object-[center_30%]"
        />
        {/* Legibility: fade the image into the night on the text side. */}
        <div
          aria-hidden="true"
          className="from-night via-night/40 lg:via-night/85 absolute inset-0 bg-gradient-to-t via-35% to-transparent to-60% lg:bg-gradient-to-r lg:via-35% lg:to-65%"
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
              href="/#how-it-works"
              className={buttonClass('secondary', 'md', 'bg-night/60 h-12 px-6 text-base')}
            >
              See how it works
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
