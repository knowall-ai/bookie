import { NextResponse, type NextRequest } from 'next/server';
import { pageCsp, resourceCsp, voiceOrigin } from '@/lib/security/headers';

/**
 * Per-request nonce Content-Security-Policy, per the Next 16 CSP guide
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * Next reads the nonce from the request's CSP header while rendering and
 * stamps it on its own scripts, so pages render per request (app/layout.tsx).
 * The other security headers come from next.config.ts.
 */

/**
 * File downloads and previews (PDFs, attachment bytes) set their own headers:
 * attachment previews must be frameable by our own pages
 * (lib/portal/attachments-proxy.ts), and a `default-src 'none'` policy on a
 * PDF response can stop the browser's built-in PDF viewer.
 */
const FILE_ROUTE =
  /^\/api\/orgs\/[^/]+\/(?:attachments\/|accounts-inbox\/|(?:invoices|quotes)\/[^/]+\/pdf$)/;

/**
 * public/ files and metadata routes (robots.txt, icon.svg...). An explicit
 * list, not "anything with a dot": org keys in portal URLs contain dots
 * (`/portal/demo.contoso`, `/portal/xero.<id>.<id>`).
 */
const STATIC_FILE = /\.(?:png|jpe?g|webp|gif|svg|ico|mp4|webm|vtt|txt|xml|json|webmanifest)$/i;

export type CspKind = 'page' | 'resource' | 'own';

/** Which policy a path gets. */
export function cspKind(pathname: string): CspKind {
  if (FILE_ROUTE.test(pathname)) return 'own';
  // API routes and public/ files aren't pages.
  if (pathname.startsWith('/api/')) return 'resource';
  if (!pathname.startsWith('/portal/') && STATIC_FILE.test(pathname)) return 'resource';
  return 'page';
}

export function proxy(request: NextRequest) {
  const kind = cspKind(request.nextUrl.pathname);
  if (kind === 'own') return NextResponse.next();
  if (kind === 'resource') {
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', resourceCsp);
    return response;
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = pageCsp(nonce, {
    dev: process.env.NODE_ENV === 'development',
    voiceOrigin: voiceOrigin(),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Static build output, image optimisation and /.well-known (security.txt).
      source: '/((?!_next/static|_next/image|\\.well-known/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
