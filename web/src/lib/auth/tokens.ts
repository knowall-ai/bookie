import 'server-only';
import { createHash } from 'node:crypto';
import { scopeFor, type ResourceName } from './resources';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Per-resource access tokens, cached in memory only and keyed by a hash of the
 * refresh token, so a token is only ever reused for the session that minted it.
 */
const cache = new Map<string, CachedToken>();
const MAX_ENTRIES = 5000;

export class ReauthRequiredError extends Error {
  constructor(message = 'Your Microsoft sign-in has expired. Please sign in again.') {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

function cacheKey(refreshToken: string, resource: ResourceName): string {
  return `${createHash('sha256').update(refreshToken).digest('hex')}:${resource}`;
}

export async function redeemRefreshToken(
  tenantId: string,
  refreshToken: string,
  resource: ResourceName
): Promise<string> {
  const key = cacheKey(refreshToken, resource);
  const hit = cache.get(key);
  if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.accessToken;

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.AZURE_AD_CLIENT_ID ?? '',
      client_secret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      scope: scopeFor(resource),
    }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !body.access_token) {
    if (body.error === 'invalid_grant' || body.error === 'interaction_required') {
      throw new ReauthRequiredError();
    }
    throw new Error(`Could not get a ${resource} token: ${body.error ?? response.status}`);
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, {
    accessToken: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  });
  return body.access_token;
}
