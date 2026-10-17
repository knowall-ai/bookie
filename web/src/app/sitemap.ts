import type { MetadataRoute } from 'next';

/** Canonical public origin. Self-hosters set BOOKIE_SITE_URL; read at build time. */
const BASE = (process.env.BOOKIE_SITE_URL ?? 'https://getbook.ie').replace(/\/$/, '');

const PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/install', priority: 0.8 },
  { path: '/security', priority: 0.7 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-10-17');
  return PAGES.map((p) => ({
    url: `${BASE}${p.path}`,
    lastModified,
    changeFrequency: 'monthly',
    priority: p.priority,
  }));
}
