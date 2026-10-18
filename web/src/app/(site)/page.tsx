import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/Button';
import { ConnectorDemo } from '@/components/site/ConnectorDemo';
import { Faq, type FaqItem } from '@/components/site/Faq';
import { Hero } from '@/components/site/Hero';
import { IntroVideo } from '@/components/site/IntroVideo';
import { OrgSwitcherMock } from '@/components/site/OrgSwitcherMock';
import { PortalScreenshots } from '@/components/site/PortalScreenshots';
import { SecuritySection } from '@/components/site/SecuritySection';
import {
  Container,
  DoubleRule,
  GITHUB_URL,
  GitHubMark,
  SectionHeading,
  display,
} from '@/components/site/ui';
import { cn } from '@/lib/ui/cn';
import { parseVtt } from '@/lib/ui/vtt';
import teams from '../../../public/bookie/teams.webp';

export const metadata: Metadata = {
  title: { absolute: 'Bookie: clear books, and an AI bookkeeper who never clocks off' },
  description:
    'A familiar, Xero-style portal over Xero or Microsoft Dynamics 365 Business Central. Switch between every client’s books with one Microsoft sign-in, and ask Bookie the AI bookkeeper what the numbers mean. Open source, by KnowAll AI.',
  alternates: { canonical: '/' },
};

const STEPS = [
  {
    title: 'Install for your Microsoft 365 organisation',
    body: 'An administrator approves Bookie once, for everyone. It asks for sign-in, your profile, Business Central as you, and permission to keep its settings in your own SharePoint. Nothing else.',
    who: 'Microsoft 365 admin',
  },
  {
    title: 'Connect Xero or Business Central',
    body: 'Business Central already knows you from your Microsoft sign-in, so you just switch it on. For Xero, approve each organisation on Xero’s own consent screen.',
    who: 'You',
  },
  {
    title: 'Open your books',
    body: 'Invoices, bills, contacts, bank accounts and reports, laid out the way you know them from Xero, for every organisation you have access to.',
    who: 'Your whole team',
  },
];

const FAQ: FaqItem[] = [
  {
    q: 'Do I need to move off Xero or Business Central?',
    a: 'No. Bookie sits on top of the system you already use and reads it live through its official API. Your subscription, your data and your accountant’s access all stay exactly where they are. Stop using Bookie and nothing changes in your books.',
  },
  {
    q: 'Who is Bookie for?',
    a: 'Accountants and bookkeepers who look after many organisations, and finance teams who want one clear view across Xero and Business Central. If you already live in Microsoft 365 and Teams, it will feel at home.',
  },
  {
    q: 'Does Bookie store my accounting data?',
    a: (
      <>
        No. Every page is read live from Xero or Business Central when you open it. The only thing
        Bookie keeps is your connection settings, sealed with encryption and stored in a hidden
        SharePoint list in your own Microsoft 365. The <Link href="/security">security page</Link>{' '}
        has the detail.
      </>
    ),
  },
  {
    q: 'Can Bookie change anything in my books?',
    a: 'Only what you can already change, because Bookie acts as you, with your own permissions in Xero or Business Central. Anything that posts to your books, such as approving, voiding or emailing an invoice, asks you to confirm first.',
  },
  {
    q: 'Can Bookie show a Bitcoin wallet, and is that safe?',
    a: 'Yes, as a bank account, from the wallet’s extended public key (xpub) or output descriptor. An xpub can see a wallet but can never spend from it, and Bookie refuses private keys. For a Business Central company the xpub is kept on the bank account in your own Business Central. Bookie looks up the transactions through an Electrum server chosen by whoever runs your Bookie; that server sees which addresses are asked about, so we recommend your own node. Values in your organisation’s base currency come from Kraken at each transaction’s own time, and each one says which Kraken price and time it used.',
  },
  {
    q: 'Is my Xero data used to train AI?',
    a: 'Never. Bookie the AI bookkeeper looks up your accounts live, for the question you asked, and forgets the figures afterwards. Xero data is not used to train or fine-tune any model, in line with Xero’s developer terms.',
  },
  {
    q: 'How does Bookie join a Teams call?',
    a: 'With the agent add-on, Bookie has his own Microsoft 365 account in your organisation. Invite him to a meeting like any colleague; he joins, listens, and answers questions about the accounts you have given him access to.',
  },
  {
    q: 'What does it cost?',
    a: 'The portal is open source under the MIT licence: run it yourself for free, or use it at getbook.ie. Bookie the AI bookkeeper is a paid add-on, installed in your own Azure subscription or hosted by KnowAll AI on request. Get in touch for pricing.',
  },
  {
    q: 'Which accounting systems are next?',
    a: 'Microsoft Dynamics 365 Finance, and simple books kept in your own SharePoint. Because every system plugs into the same model, new connectors arrive without changing how Bookie looks or works.',
  },
];

/** The intro video's captions, read once at build time for the transcript. */
const INTRO_CUES = parseVtt(
  readFileSync(path.join(process.cwd(), 'public/bookie/bookie-intro.vtt'), 'utf8')
);

const HAIRLINE = 'border-line/70 border-t';
/** Bookie's sunlit pictures sit in a thin gold frame, like the trim on his chassis. */
const PICTURE_FRAME = 'rounded-[16px] ring-1 ring-[#d4a64a]/35';

export default function Landing() {
  return (
    <>
      <Hero />

      {/* How it works: three steps, set out like a ledger. */}
      <section aria-labelledby="how-it-works" className="scroll-mt-20 py-24 sm:py-32">
        <Container>
          <SectionHeading
            id="how-it-works"
            title="Three steps, and your books are open"
            lead="No migration and no new accounting system. Bookie connects to what you already have."
          />
          <ol className="mt-14">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="border-line/80 grid grid-cols-[2.5rem_1fr] gap-x-4 gap-y-2 border-t py-7 sm:grid-cols-[4rem_1fr_12rem] sm:gap-x-8"
              >
                <span
                  className={cn(display, 'num text-3xl leading-none text-[#c8a24a] sm:text-4xl')}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-ink text-xl font-semibold tracking-tight">{step.title}</h3>
                  <p className="text-body mt-2 max-w-2xl leading-relaxed">{step.body}</p>
                </div>
                <p className="text-muted col-start-2 text-sm sm:col-start-3 sm:pt-1.5 sm:text-right">
                  {step.who}
                </p>
              </li>
            ))}
          </ol>
          <DoubleRule />
          <p className={cn(display, 'text-ink mt-5 text-right text-2xl italic')}>
            Balanced, and ready to read.
          </p>
        </Container>
      </section>

      {/* Built for accountants. */}
      <section
        aria-labelledby="accountants"
        className={cn(HAIRLINE, 'bg-canvas/40 py-24 sm:py-32')}
      >
        <Container className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <SectionHeading
              id="accountants"
              title="Built for people who keep more than one set of books"
              lead="Every organisation you can reach in Xero or Business Central sits in one menu. Switch clients in a click, without signing out or remembering another password."
            />
            <ul className="mt-10 space-y-6">
              <Point title="One sign-in">
                Your work Microsoft account opens everything. Multi-factor authentication and
                conditional access come from your own Microsoft 365.
              </Point>
              <Point title="Xero and Business Central side by side">
                Clients on Xero and clients on Business Central appear in the same list and the same
                layout.
              </Point>
              <Point title="The vocabulary you already use">
                Draft, Awaiting approval, Awaiting payment, Paid. The same tabs, columns and totals
                as Xero, so there is nothing to retrain.
              </Point>
            </ul>
          </div>
          <OrgSwitcherMock />
        </Container>
      </section>

      {/* Connectors. */}
      <section aria-labelledby="connectors" className={cn(HAIRLINE, 'scroll-mt-20 py-24 sm:py-32')}>
        <Container className="grid items-start gap-16 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading
              id="connectors"
              title="Xero or Business Central. The same books either way."
              lead="Bookie reads each system through its official API and shows it in one familiar layout. Flip the switch: the page stays the same, only the source changes."
            />
            <div className="mt-10">
              <h3 className="text-ink text-sm font-semibold">Coming next</h3>
              <ul className="text-body mt-3 space-y-2 text-sm">
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8a24a]" />
                  Microsoft Dynamics 365 Finance, for groups that have outgrown Business Central.
                </li>
                <li className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8a24a]" />
                  Your own SharePoint, for simple books kept in lists inside your Microsoft 365.
                </li>
              </ul>
            </div>
            <div className="mt-10" data-testid="site-bitcoin">
              <h3 className="text-ink text-sm font-semibold">Bitcoin wallets as bank accounts</h3>
              <p className="text-body mt-3 text-sm leading-relaxed">
                Add a wallet’s xpub or output descriptor, single-key, Taproot or multisig, and it
                appears under Bank accounts, read live from the blockchain. Each transaction shows
                what it was worth at the time in your organisation’s own currency, from the Kraken
                price at that moment, labelled with its source. Watch-only: Bookie can see the
                wallet but never spend from it. In Business Central the xpub sits on the bank
                account itself.
              </p>
            </div>
          </div>
          <ConnectorDemo />
        </Container>
      </section>

      {/* Meet Bookie: his 30-second introduction, then what he does. */}
      <section aria-labelledby="bookie" className={cn(HAIRLINE, 'scroll-mt-16 py-24 sm:py-32')}>
        <Container>
          <SectionHeading
            id="bookie"
            title="Meet Bookie, the bookkeeper who reads every line"
            lead="Bookie knows double entry, your chart of accounts and what an aged debtors report is trying to tell you. Ask him anything about the books in front of you, in plain English."
          />
          <IntroVideo cues={INTRO_CUES} className="mt-12 sm:mt-14" />
          <div className="mt-20 grid items-center gap-12 sm:mt-24 lg:grid-cols-[1.1fr_1fr]">
            <Image
              src={teams}
              alt="Bookie waving hello from a Teams call on a colleague’s monitor, beside three other people on the call"
              placeholder="blur"
              sizes="(min-width: 1024px) 560px, 100vw"
              className={cn(PICTURE_FRAME, 'w-full')}
            />
            <ul className="space-y-8">
              <Point title="In the portal, by chat or voice">
                Open Bookie from any page. He can see the organisation you are in and answers from
                the live figures, not a stale copy.
              </Point>
              <Point title="On your Teams calls, with his own account">
                Bookie has his own Microsoft 365 account. Invite him to the month-end call and he
                joins, listens and answers when asked.
              </Point>
              <Point title="Advice, not just numbers">
                Why did margin drop in September? Who should we chase first? What is still waiting
                to be reconciled? Bookie explains, and shows his working.
              </Point>
            </ul>
          </div>
          <div className="border-brand/25 bg-brand/[0.06] mt-14 flex flex-col gap-4 rounded-(--radius-card) border p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body max-w-2xl text-sm leading-relaxed">
              <strong className="text-ink">Bookie the agent is a paid add-on.</strong> We install
              him in your own Azure subscription, so his account, memory and voice stay in your
              tenant. Prefer us to run him? KnowAll AI can host him for you on request.
            </p>
            <a
              href="https://knowall.ai"
              rel="noreferrer"
              className={buttonClass('secondary', 'md', 'shrink-0')}
            >
              Talk to KnowAll AI
            </a>
          </div>
        </Container>
      </section>

      {/* Data: Bookie by the vault, full bleed. */}
      <SecuritySection />

      {/* Screenshots: real portal pages on Microsoft's CRONUS sample company. */}
      <section aria-labelledby="screenshots-title" className={cn(HAIRLINE, 'py-24 sm:py-32')}>
        <Container>
          <SectionHeading
            id="screenshots-title"
            title="See the portal"
            lead="Sales, purchases, contacts, reports and Bookie himself, in the layout you already know."
          />
          <PortalScreenshots />
        </Container>
      </section>

      {/* Open source. */}
      <section
        aria-labelledby="open-source"
        className={cn(HAIRLINE, 'bg-canvas/40 scroll-mt-20 py-24 sm:py-32')}
      >
        <Container className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="open-source"
            title="Open source, so you can check our sums"
            lead="Bookie is MIT licensed. Read every line that touches your books, run it in your own Azure, or send us an improvement. Accounting software should be this easy to audit."
          />
          <a
            href={GITHUB_URL}
            rel="noreferrer"
            className={buttonClass('secondary', 'md', 'h-12 shrink-0 px-6 text-base')}
          >
            <GitHubMark className="h-5 w-5" />
            knowall-ai/bookie on GitHub
          </a>
        </Container>
      </section>

      {/* FAQ. */}
      <section aria-labelledby="faq" className={cn(HAIRLINE, 'scroll-mt-20 py-24 sm:py-32')}>
        <Container className="grid gap-12 lg:grid-cols-[1fr_2fr]">
          <SectionHeading id="faq" title="Questions" />
          <Faq items={FAQ} />
        </Container>
      </section>

      {/* Closing call to action. */}
      <section aria-labelledby="cta" className={cn(HAIRLINE, 'grid-glow py-24 sm:py-32')}>
        <Container className="flex flex-col items-center text-center">
          <Image
            src="/bookie/avatar.png"
            alt=""
            width={96}
            height={96}
            className="ring-brand/40 rounded-full ring-2"
          />
          <h2
            id="cta"
            className={cn(
              display,
              'text-ink mt-8 max-w-2xl text-4xl leading-tight font-medium tracking-[-0.02em] text-balance sm:text-5xl'
            )}
          >
            Your books are ready when you are.
          </h2>
          <p className="text-body mt-4 max-w-lg text-lg">
            Ask your Microsoft 365 administrator to install Bookie, or sign in if your organisation
            already has.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/install" className={buttonClass('primary', 'md', 'h-12 px-6 text-base')}>
              Get started
            </Link>
            <Link href="/portal" className={buttonClass('secondary', 'md', 'h-12 px-6 text-base')}>
              Sign in
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}

function Point({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="border-brand/60 border-l-2 pl-5">
      <h3 className="text-ink font-semibold">{title}</h3>
      <p className="text-body mt-1.5 leading-relaxed">{children}</p>
    </li>
  );
}
