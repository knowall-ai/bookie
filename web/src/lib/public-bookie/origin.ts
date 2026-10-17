/**
 * Origin and Referer checks for /api/public/*. A browser always sends Origin
 * on a POST; for a same-origin GET it may send only Referer. A request with
 * neither, or from anywhere else, is refused. This stops other sites embedding
 * the helper and spending our quota from their pages; it is not a defence
 * against scripts (they can forge headers), which is what the bot check and
 * rate limits are for.
 */
export function requestOrigin(headers: Headers): string | undefined {
  const origin = headers.get('origin');
  if (origin && origin !== 'null') return origin;
  const referer = headers.get('referer');
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function isAllowedOrigin(
  headers: Headers,
  allowed: string[],
  options: { allowLocalhost?: boolean } = {}
): boolean {
  const origin = requestOrigin(headers);
  if (!origin) return false;
  if (allowed.includes(origin)) return true;
  return !!options.allowLocalhost && LOCALHOST.test(origin);
}

/**
 * The caller's IP for rate limiting. Azure App Service appends the client
 * address to X-Forwarded-For, so the rightmost entry is the one App Service saw;
 * anything to its left was supplied by the client and is ignored. Behind
 * Cloudflare, set PUBLIC_BOOKIE_CLIENT_IP_HEADER=cf-connecting-ip.
 */
export function clientIp(headers: Headers, trustedHeader?: string): string {
  if (trustedHeader) {
    const value = headers.get(trustedHeader)?.trim();
    if (value) return stripPort(value);
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) return stripPort(parts[parts.length - 1]);
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}

function stripPort(ip: string): string {
  // IPv4 with port ("1.2.3.4:5678") or bracketed IPv6 ("[::1]:5678").
  const v4 = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (v4) return v4[1];
  const v6 = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  return v6 ? v6[1] : ip;
}
