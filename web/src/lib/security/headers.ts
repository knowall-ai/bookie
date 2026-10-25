/**
 * Security headers. next.config.ts sends the baseline headers on every
 * response (public/ files included); src/proxy.ts sets the Content-Security-
 * Policy, which carries a per-request nonce for pages.
 *
 * Plain module with no Next imports, so next.config.ts can import it too.
 */

/** Headers sent on every response. */
export const baselineHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Voice calls with Bookie use the microphone; nothing uses the camera or location.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

/** Cloudflare Turnstile, the public helper's optional human check (script + iframe). */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/**
 * The https origin of an Azure OpenAI endpoint setting, or undefined. Portal
 * voice calls post their WebRTC offer from the browser straight to
 * `${endpoint}/openai/v1/realtime/calls` (see /api/bookie/voice), so that one
 * origin needs connect-src.
 */
export function httpsOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

/** The origin the browser calls for portal voice, from the same settings /api/bookie/voice uses. */
export function voiceOrigin(env: Record<string, string | undefined> = process.env) {
  return httpsOrigin(env.AZURE_VOICE_ENDPOINT ?? env.AZURE_OPENAI_ENDPOINT);
}

export interface PageCspOptions {
  /** `next dev`: React needs eval for its error overlays, and the site is plain http. */
  dev?: boolean;
  /** Extra connect-src origin for portal voice (see voiceOrigin). */
  voiceOrigin?: string;
}

/**
 * CSP for Next-rendered pages. Scripts run only by the per-request nonce;
 * 'strict-dynamic' passes that trust to the chunks and the Turnstile script
 * Next's own (nonced) code loads.
 */
export function pageCsp(nonce: string, { dev = false, voiceOrigin }: PageCspOptions = {}) {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Ignored by browsers that understand 'strict-dynamic'; a fallback for older ones.
      TURNSTILE_ORIGIN,
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // React style={…} props, sonner's injected <style>, and the held-email
    // preview (a srcdoc iframe, which inherits this policy) need inline styles.
    // A nonce can't cover style attributes. Scripts stay strict, which is what stops XSS.
    'style-src': ["'self'", "'unsafe-inline'"],
    // Everything is served from our origin (fonts are self-hosted by next/font).
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'", ...(voiceOrigin ? [voiceOrigin] : [])],
    // Attachment previews (our own /api) and the Turnstile widget.
    'frame-src': ["'self'", TURNSTILE_ORIGIN],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    // Server actions post to our origin; Microsoft and Xero sign-in are
    // navigations (fetch then location / links), not form posts.
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return [
    ...Object.entries(directives).map(([name, values]) => `${name} ${values.join(' ')}`),
    ...(dev ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}

/** CSP for API responses and public/ files: they are data, never documents that run code. */
export const resourceCsp = "default-src 'none'; frame-ancestors 'none'";
