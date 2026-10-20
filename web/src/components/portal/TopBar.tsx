'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { LogoTile } from '@/components/brand/Logo';
import { cn } from '@/lib/ui/cn';
import type { OrgRef } from '@/lib/domain/types';
import { CREATE_ITEMS, NAV, type ModuleAvailability, type NavTab } from '@/lib/portal/nav';
import { BookieLauncher } from '@/components/bookie/BookieLauncher';
import { initials, nextMenuIndex } from './user-menu';

/* ------------------------------------------------------------------ */
/* Small popover helper                                                */
/* ------------------------------------------------------------------ */

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  // Close on navigation (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const panel =
  'bg-surface-2 border-line-strong absolute z-50 mt-2 overflow-hidden rounded-xl border p-1.5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]';

/* ------------------------------------------------------------------ */
/* Org switcher                                                        */
/* ------------------------------------------------------------------ */

function sourceDot(kind: OrgRef['kind']) {
  return kind === 'xero'
    ? 'bg-[#13b5ea]'
    : kind === 'business-central'
      ? 'bg-[#0f9a8e]'
      : 'bg-lime';
}

export function OrgSwitcher({ org, orgs }: { org?: OrgRef; orgs: OrgRef[] }) {
  const { open, setOpen, ref } = usePopover();
  const [filter, setFilter] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const shown = orgs.filter((o) => o.name.toLowerCase().includes(filter.toLowerCase()));

  const switchTo = (target: OrgRef) => {
    // Keep the user on the same tab when switching, like Xero.
    const rest = org ? pathname.split('/').slice(3, 5).join('/') : '';
    router.push(`/portal/${encodeURIComponent(target.key)}${rest ? `/${rest}` : ''}`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="org-switcher"
        className="hover:bg-surface-2 flex max-w-[150px] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors sm:max-w-[230px]"
      >
        <span className="min-w-0">
          <span className="text-ink block truncate text-sm leading-tight font-semibold">
            {org?.name ?? 'Choose an organisation'}
          </span>
          {org && (
            <span className="text-muted flex items-center gap-1.5 truncate text-[11px] leading-tight whitespace-nowrap">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', sourceDot(org.kind))} />
              {org.sourceLabel}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn('text-muted h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className={cn(panel, 'left-0 w-80')}>
          {orgs.length > 6 && (
            <div className="p-1.5">
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find an organisation"
                className="bg-surface border-line-strong text-ink placeholder:text-faint focus:border-brand h-9 w-full rounded-lg border px-3 text-sm outline-none"
              />
            </div>
          )}
          <p className="text-faint px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            Organisations
          </p>
          <ul role="listbox" className="max-h-80 overflow-y-auto">
            {shown.map((o) => (
              <li key={o.key}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.key === org?.key}
                  onClick={() => switchTo(o)}
                  className="hover:bg-surface-3 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left"
                >
                  <span className="bg-surface-3 text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-ink block truncate text-sm">{o.name}</span>
                    <span className="text-muted flex items-center gap-1.5 text-xs">
                      <span className={cn('h-1.5 w-1.5 rounded-full', sourceDot(o.kind))} />
                      {o.sourceLabel}
                    </span>
                  </span>
                  {o.key === org?.key && <Check className="text-brand h-4 w-4" />}
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="text-muted px-3 py-3 text-sm">No organisations match.</li>
            )}
          </ul>
          <div className="border-line mt-1 border-t pt-1">
            {org && (
              <Link
                href={`/portal/${encodeURIComponent(org.key)}/settings`}
                className="text-body hover:bg-surface-3 block rounded-lg px-3 py-2 text-sm"
              >
                Organisation settings
              </Link>
            )}
            <Link
              href="/portal"
              className="text-body hover:bg-surface-3 block rounded-lg px-3 py-2 text-sm"
            >
              My organisations
            </Link>
            <Link
              href="/portal/settings"
              className="text-body hover:bg-surface-3 block rounded-lg px-3 py-2 text-sm"
            >
              Add or manage connections
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function TabMenu({
  tab,
  base,
  modules,
  active,
}: {
  tab: NavTab;
  base: string;
  modules: ModuleAvailability;
  active: boolean;
}) {
  const { open, setOpen, ref } = usePopover();
  const tabClass = cn(
    'relative flex h-14 items-center gap-1 px-2.5 text-sm font-medium transition-colors',
    active ? 'text-ink' : 'text-muted hover:text-ink'
  );
  const underline = active && (
    <span className="bg-brand absolute inset-x-3 bottom-0 h-0.5 rounded-full" />
  );

  if (!tab.items) {
    return (
      <Link
        href={`${base}${tab.href}`}
        className={tabClass}
        aria-current={active ? 'page' : undefined}
      >
        {tab.label}
        {underline}
      </Link>
    );
  }
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className={tabClass}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        data-testid={`tab-${tab.key}`}
      >
        {tab.label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        {underline}
      </button>
      {open && (
        <div role="menu" className={cn(panel, 'top-full left-0 mt-0 w-60')}>
          {tab.items.map((item) => {
            const available = !item.module || modules[item.module];
            return available ? (
              <Link
                key={item.href + item.label}
                role="menuitem"
                href={`${base}${item.href}`}
                className="text-body hover:bg-surface-3 hover:text-ink block rounded-lg px-3 py-2 text-sm"
              >
                {item.label}
              </Link>
            ) : (
              <span
                key={item.href + item.label}
                role="menuitem"
                aria-disabled="true"
                title="Not available for this organisation's accounting system"
                className="text-faint flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm"
              >
                {item.label}
                <span className="text-[10px] tracking-wide uppercase">n/a</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateMenu({ base, modules }: { base: string; modules: ModuleAvailability }) {
  const { open, setOpen, ref } = usePopover();
  const items = CREATE_ITEMS.filter((i) => !i.module || modules[i.module]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Create new"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="bg-surface-2 border-line-strong text-ink hover:border-brand/60 flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className={cn(panel, 'right-0 w-56')}>
          <p className="text-faint px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
            Create new
          </p>
          {items.map((item) => (
            <Link
              key={item.href}
              role="menuitem"
              href={`${base}${item.href}`}
              className="text-body hover:bg-surface-3 hover:text-ink block rounded-lg px-3 py-2 text-sm"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Microsoft 365 profile photo from /api/me/photo, over initials until (and unless) it loads. */
function Avatar({ name, photo, className }: { name: string; photo: boolean; className: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const img = useRef<HTMLImageElement>(null);
  // The image can finish (or 404) before hydration attaches onLoad/onError.
  useEffect(() => {
    const el = img.current;
    if (el?.complete) setState(el.naturalWidth > 0 ? 'loaded' : 'failed');
  }, []);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-brand/15 text-brand-bright border-brand/30 relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-bold',
        className
      )}
    >
      {initials(name)}
      {photo && state !== 'failed' && (
        // A plain <img>: a tiny private image from our own route, and it needs onError for the fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src="/api/me/photo"
          alt=""
          draggable={false}
          decoding="async"
          data-testid="user-photo"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity',
            state === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}
    </span>
  );
}

const menuItem =
  'text-body hover:bg-surface-3 hover:text-ink focus-visible:bg-surface-3 focus-visible:text-ink flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none';

/** The account menu, like Thyme's: photo and chevron, then name, email, Settings, Bookie's emails (members) and Sign out. */
export function UserMenu({
  user,
  devMode,
}: {
  user: { name: string; email: string; userType?: string };
  devMode?: string;
}) {
  const { open, setOpen, ref } = usePopover();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // Demo users have no Microsoft account, so there is no photo to ask for.
  const photo = devMode !== 'demo';

  const items = () =>
    Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (e.key === 'Tab') {
      // Close after the browser has moved focus on, so Tab reaches the next control.
      window.setTimeout(() => setOpen(false), 0);
      return;
    }
    const list = items();
    const next = nextMenuIndex(
      e.key,
      list.indexOf(document.activeElement as HTMLElement),
      list.length
    );
    if (next !== null) {
      e.preventDefault();
      list[next]?.focus();
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'user-menu' : undefined}
        data-testid="user-menu-button"
        className="hover:bg-surface-2 focus-visible:ring-brand/60 flex items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors outline-none focus-visible:ring-2"
      >
        <Avatar name={user.name} photo={photo} className="h-8 w-8 text-xs" />
        {/* Like Thyme: a chevron so it reads as a menu, turned up while open. */}
        <ChevronDown
          aria-hidden="true"
          data-testid="user-menu-chevron"
          className={cn('text-muted h-4 w-4 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          ref={menu}
          id="user-menu"
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          data-testid="user-menu"
          className={cn(panel, 'right-0 w-72')}
        >
          <div className="border-line flex items-center gap-3 border-b px-3 pt-2 pb-3">
            <Avatar name={user.name} photo={photo} className="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="text-ink truncate text-sm font-semibold">{user.name}</p>
              <p className="text-muted truncate text-xs">{user.email}</p>
              {devMode && <p className="text-warn mt-1 text-[11px]">Dev sign-in: {devMode}</p>}
            </div>
          </div>
          <div className="pt-1">
            <Link
              href="/portal/settings"
              role="menuitem"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className={menuItem}
            >
              <Settings className="text-muted h-4 w-4" /> Settings
            </Link>
            {user.userType === 'Member' && (
              <Link
                href="/portal/emails"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpen(false)}
                className={menuItem}
              >
                <Mail className="text-muted h-4 w-4" /> Bookie’s emails
              </Link>
            )}
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => signOut({ callbackUrl: '/' })}
              className={menuItem}
            >
              <LogOut className="text-muted h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

export function TopBar({
  org,
  orgs,
  modules,
  user,
  devMode,
}: {
  org?: OrgRef;
  orgs: OrgRef[];
  modules?: ModuleAvailability;
  user: { name: string; email: string };
  devMode?: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }
  const base = org ? `/portal/${encodeURIComponent(org.key)}` : '';
  const section = org ? (pathname.slice(base.length).split('/')[1] ?? '') : '';
  const activeKey = (tab: NavTab) => {
    if (tab.key === 'home') return section === '';
    if (tab.key === 'contacts') return section === 'contacts';
    return section === tab.key;
  };

  return (
    <header className="bg-canvas/90 border-line no-print sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-1.5 px-2 sm:gap-2 sm:px-5">
        <Link href={org ? base : '/portal'} aria-label="Bookie home" className="mr-1 shrink-0">
          <LogoTile className="h-8 w-8" />
        </Link>
        <OrgSwitcher org={org} orgs={orgs} />

        {org && modules && (
          <nav aria-label="Main" className="ml-1 hidden items-center xl:flex">
            {NAV.map((tab) => (
              <TabMenu
                key={tab.key}
                tab={tab}
                base={base}
                modules={modules}
                active={activeKey(tab)}
              />
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {org && modules && (
            <>
              <Link
                href={`${base}/search`}
                aria-label="Search"
                className="text-muted hover:text-ink hover:bg-surface-2 hidden h-9 w-9 items-center justify-center rounded-full sm:flex"
              >
                <Search className="h-4 w-4" />
              </Link>
              <div className="hidden sm:block">
                <CreateMenu base={base} modules={modules} />
              </div>
            </>
          )}
          <BookieLauncher orgKey={org?.key} orgName={org?.name} />
          <UserMenu user={user} devMode={devMode} />
          {org && (
            <button
              type="button"
              className="text-muted hover:text-ink flex h-9 w-9 items-center justify-center xl:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {org && modules && mobileOpen && (
        <nav
          aria-label="Main (mobile)"
          className="border-line max-h-[70vh] overflow-y-auto border-t px-4 py-3 xl:hidden"
        >
          {NAV.map((tab) => (
            <div key={tab.key} className="py-1">
              <Link href={`${base}${tab.href}`} className="text-ink block py-1.5 font-semibold">
                {tab.label}
              </Link>
              {tab.items
                ?.filter((i) => !i.module || modules[i.module])
                .map((item) => (
                  <Link
                    key={item.href + item.label}
                    href={`${base}${item.href}`}
                    className="text-muted hover:text-ink block py-1 pl-3 text-sm"
                  >
                    {item.label}
                  </Link>
                ))}
            </div>
          ))}
        </nav>
      )}
    </header>
  );
}
