import Image from 'next/image';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { Container, GITHUB_URL, GitHubMark } from './ui';

const LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/security', label: 'Security' },
];

export function SiteFooter() {
  return (
    <footer className="border-line/70 bg-night border-t">
      <Container className="flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo size="sm" />
          <p className="text-muted mt-4 text-sm leading-relaxed">
            A familiar view of your books in Xero or Business Central, with an AI bookkeeper on
            hand. Open source under the MIT licence.
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            {LINKS.map((l) => (
              <li key={l.href}>
                {l.href.startsWith('http') ? (
                  <a href={l.href} className="text-body hover:text-ink" rel="noreferrer">
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className="text-body hover:text-ink">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-4">
          <a
            href={GITHUB_URL}
            className="group text-muted hover:text-ink flex items-center gap-2.5 text-sm"
            rel="noreferrer"
            aria-label="Bookie is open source on GitHub"
            data-testid="footer-github"
          >
            <GitHubMark className="h-6 w-6 opacity-80 transition-opacity group-hover:opacity-100" />
            <span>Open source on GitHub</span>
          </a>
          <a
            href="https://knowall.ai"
            className="group text-muted hover:text-ink flex items-center gap-3 text-sm"
            rel="noreferrer"
          >
            <span>Built by</span>
            <Image
              src="/knowall-logo.png"
              alt="KnowAll AI"
              width={207}
              height={151}
              className="h-9 w-auto opacity-80 transition-opacity group-hover:opacity-100"
            />
          </a>
        </div>
      </Container>
      <Container className="text-faint text-xs">
        <p className="border-line/50 border-t py-5">
          © 2026 KnowAll AI Ltd. Xero is a trademark of Xero Limited. Microsoft, Dynamics 365,
          Business Central and Teams are trademarks of the Microsoft group of companies.
        </p>
      </Container>
    </footer>
  );
}
