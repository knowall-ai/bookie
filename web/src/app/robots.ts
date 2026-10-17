import type { MetadataRoute } from 'next';

/** Canonical public origin. Self-hosters set BOOKIE_SITE_URL; read at build time. */
const BASE = (process.env.BOOKIE_SITE_URL ?? 'https://getbook.ie').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/portal', '/api/', '/signin', '/install/complete'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
