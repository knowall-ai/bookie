/**
 * Links the public helper may show: our own site pages, knowall.ai and the
 * Bookie repository. Shared by the server (sanitising replies) and the widget
 * (rendering them), so no other URL is ever clickable.
 */
const ALLOWED_HOSTS = new Set([
  'getbook.ie',
  'www.getbook.ie',
  'bookie.knowall.ai',
  'knowall.ai',
  'www.knowall.ai',
]);
const SITE_PATHS = /^\/(install|security|privacy|terms|portal)?(#[\w-]+)?$/;

export function isAllowedLink(href: string): boolean {
  if (SITE_PATHS.test(href)) return true;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.search) return false;
    if (url.hostname === 'github.com') return /^\/knowall-ai\/bookie\/?$/.test(url.pathname);
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
