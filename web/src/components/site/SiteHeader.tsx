'use client';

import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { buttonClass } from '@/components/ui/Button';
import { cn } from '@/lib/ui/cn';

export const SITE_NAV = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#connectors', label: 'Xero & Business Central' },
  { href: '/#bookie', label: 'Bookie agent' },
  { href: '/security', label: 'Security' },
  { href: '/#open-source', label: 'Open source' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-colors duration-300',
        scrolled || open
          ? 'border-line/80 bg-night/85 backdrop-blur-md'
          : 'bg-night/30 border-transparent backdrop-blur-[2px]'
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Bookie home" className="shrink-0 rounded-md">
          <Logo size="sm" />
        </Link>

        <nav aria-label="Main" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {SITE_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-muted hover:text-ink rounded-md px-2.5 py-2 text-sm transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/portal" className={buttonClass('ghost', 'sm', 'text-ink')}>
            Sign in
          </Link>
          <Link href="/install" className={buttonClass('primary', 'sm', 'hidden sm:inline-flex')}>
            Get started
          </Link>
          <button
            type="button"
            className="text-ink hover:bg-surface-2 inline-flex h-9 w-9 items-center justify-center rounded-lg lg:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <nav
        id="site-menu"
        aria-label="Main"
        hidden={!open}
        className="border-line/80 border-t px-5 pt-2 pb-5 sm:px-8 lg:hidden"
      >
        <ul className="flex flex-col">
          {SITE_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-body hover:text-ink border-line/60 block border-b py-3 text-base"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/install"
          onClick={() => setOpen(false)}
          className={buttonClass('primary', 'md', 'mt-5 w-full sm:hidden')}
        >
          Get started
        </Link>
      </nav>
    </header>
  );
}
