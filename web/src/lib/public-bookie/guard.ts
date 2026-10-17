import 'server-only';
import {
  allowLocalhostOrigins,
  allowedOrigins,
  clientIpHeader,
  publicBookieEnabled,
} from './config';
import { clientIp, isAllowedOrigin } from './origin';
import { verifyPass } from './pass';
import type { RateLimiter } from './rate-limit';

/**
 * The checks every /api/public route runs first, in order: kill switch,
 * Origin/Referer, then (where asked) the human pass and rate limits.
 * Returns a ready error Response, or the caller's IP and pass id.
 */
export type Guarded = { ok: true; ip: string; passId?: string } | { ok: false; response: Response };

const NO_STORE = { 'Cache-Control': 'no-store' };

export function jsonError(status: number, error: string, extra?: HeadersInit): Response {
  return Response.json({ error }, { status, headers: { ...NO_STORE, ...extra } });
}

export function guard(
  request: Request,
  options: { pass?: boolean; limits?: RateLimiter[] } = {}
): Guarded {
  if (!publicBookieEnabled()) {
    return { ok: false, response: jsonError(503, "Bookie's public helper is switched off.") };
  }
  if (
    !isAllowedOrigin(request.headers, allowedOrigins(), { allowLocalhost: allowLocalhostOrigins() })
  ) {
    return { ok: false, response: jsonError(403, 'Not allowed from this site.') };
  }
  const ip = clientIp(request.headers, clientIpHeader());
  let passId: string | undefined;
  if (options.pass) {
    passId = verifyPass(request.headers.get('x-bookie-pass'), ip);
    if (!passId) return { ok: false, response: jsonError(401, 'Please verify and try again.') };
  }
  for (const limiter of options.limits ?? []) {
    const result = limiter.hit(ip);
    if (!result.ok) {
      return {
        ok: false,
        response: jsonError(
          429,
          'Bookie needs a short break. Please try again in a little while.',
          {
            'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
          }
        ),
      };
    }
  }
  return { ok: true, ip, passId };
}

/** Hit a global (all-visitor) limiter. */
export function globalLimit(limiter: RateLimiter): Response | undefined {
  const result = limiter.hit('global');
  if (result.ok) return undefined;
  return jsonError(503, 'Bookie is very busy right now. Please try again later.', {
    'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
  });
}

/** Counts and errors only: never message text, transcripts or IPs. */
export function logEvent(event: Record<string, string | number | boolean | undefined>) {
  console.info(JSON.stringify({ evt: 'public_bookie', ...event }));
}
