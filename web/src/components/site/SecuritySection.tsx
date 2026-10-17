import { getImageProps } from 'next/image';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { cn } from '@/lib/ui/cn';
import { Container, SectionHeading } from './ui';
import wideShot from '../../../public/bookie/security.webp';
import tallShot from '../../../public/bookie/security-portrait.webp';

const ALT =
  'Bookie, an ivory robot with gold trim, round gold-rimmed glasses and a green banker’s eyeshade, standing calmly in front of a closed brass vault door, lit warm gold against the dark';

const FACTS = [
  {
    term: 'Bookie never stores your accounts',
    body: 'Every figure is read live from Xero or Business Central when you ask for it, and is gone when you close the page.',
  },
  {
    term: 'Settings sealed, and kept in your own Microsoft 365',
    body: 'Connection settings are encrypted per organisation and stored in a hidden SharePoint list in your tenant. Delete the list and Bookie forgets you.',
  },
  {
    term: 'Each organisation is walled off',
    body: 'Every request is tied to the Microsoft 365 organisation you signed in with, and checked again on every page.',
  },
  {
    term: 'Xero data is never used to train AI',
    body: 'Bookie answers from your books live, for the question asked. No model is trained or tuned on them.',
  },
];

/**
 * "Your data stays yours": a full-bleed band with Bookie by a closed vault
 * door, out of his study and in the dark. On wide screens he stands on the
 * right and the copy sits over the night on the left; on phones his portrait
 * sits above the copy and falls into the night beneath it, as in the hero.
 *
 * The promises are small glass cards over the picture. Where the browser
 * supports scroll-driven animation (and motion is welcome), they rise in one
 * after another and the picture settles as it scrolls into view; otherwise
 * everything is simply there.
 */
export function SecuritySection() {
  const common = { alt: ALT, fill: true, loading: 'lazy' } as const;
  const {
    props: { srcSet: wide, sizes: wideSizes },
  } = getImageProps({ ...common, src: wideShot, sizes: '(min-width: 1024px) 80vw, 100vw' });
  const { props: narrow } = getImageProps({ ...common, src: tallShot, sizes: '100vw' });

  return (
    <section
      aria-labelledby="security"
      className="border-line/70 bg-night relative isolate scroll-mt-20 overflow-hidden border-t lg:flex lg:min-h-[min(100svh,800px)] lg:items-center"
    >
      {/* Phones and tablets: a band across the top. Large: the right of the section, with
          the night on the left matching the picture's own dark ground. */}
      <div className="absolute inset-x-0 top-0 -z-20 h-[min(150vw,760px)] sm:h-[min(70vw,640px)] lg:inset-y-0 lg:right-0 lg:left-[22%] lg:h-auto">
        <picture>
          <source media="(min-width: 640px)" srcSet={wide} sizes={wideSizes} />
          {/* eslint-disable-next-line jsx-a11y/alt-text -- alt comes from getImageProps */}
          <img
            {...narrow}
            className="security-settle object-cover object-[50%_0%] sm:object-[75%_30%] lg:object-[68%_40%]"
          />
        </picture>
      </div>

      {/* Vignette, so the picture bleeds into the page rather than ending at a seam. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(120%_100%_at_72%_42%,transparent_35%,rgb(2_8_23/0.85)_100%)]"
      />
      {/* Legibility: down into the night on small screens, in from the left on large ones. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(2_8_23/0.15)_0%,rgb(2_8_23/0.1)_min(60vw,330px),rgb(2_8_23/0.92)_min(108vw,560px),rgb(2_8_23)_min(140vw,720px))] sm:bg-[linear-gradient(180deg,rgb(2_8_23/0.15)_0%,rgb(2_8_23/0.25)_min(30vw,260px),rgb(2_8_23/0.92)_min(60vw,540px),rgb(2_8_23)_min(70vw,640px))] lg:bg-[linear-gradient(90deg,rgb(2_8_23)_0%,rgb(2_8_23/0.96)_30%,rgb(2_8_23/0.82)_46%,rgb(2_8_23/0.3)_62%,rgb(2_8_23/0)_78%)]"
      />
      {/* Fade the top and foot into the neighbouring sections. */}
      <div
        aria-hidden="true"
        className="from-night absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b to-transparent"
      />
      <div
        aria-hidden="true"
        className="from-night absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t to-transparent"
      />

      <Container className="pt-[min(104vw,520px)] pb-24 sm:pt-[min(48vw,420px)] sm:pb-32 lg:py-28">
        <div className="max-w-[37rem]">
          <SectionHeading id="security" title="Your data stays yours" />
          <span aria-hidden="true" className="mt-5 block h-px w-16 bg-[#d4a64a]/70" />
          <dl className="mt-9 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {FACTS.map((fact, i) => (
              <div
                key={fact.term}
                style={{ '--i': i } as React.CSSProperties}
                className={cn(
                  'security-rise',
                  'bg-night/60 rounded-(--radius-card) border border-white/10 p-5 backdrop-blur-md',
                  'shadow-[inset_0_1px_0_rgb(212_166_74/0.18),0_18px_40px_-24px_rgb(0_0_0/0.9)]'
                )}
              >
                <dt className="text-ink flex items-start gap-2.5 font-semibold">
                  <span
                    aria-hidden="true"
                    className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4a64a]"
                  />
                  {fact.term}
                </dt>
                <dd className="text-body mt-2 pl-4 text-[0.95rem] leading-relaxed">{fact.body}</dd>
              </div>
            ))}
          </dl>
          <Link
            href="/security"
            className={buttonClass('secondary', 'md', 'bg-night/60 mt-10 backdrop-blur-md')}
          >
            Read how Bookie handles data
          </Link>
        </div>
      </Container>
    </section>
  );
}
