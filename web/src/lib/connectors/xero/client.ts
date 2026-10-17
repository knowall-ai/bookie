import 'server-only';
import { ConnectorError } from '../types';
import type { XeroConnection } from '@/lib/config/types';

const IDENTITY = 'https://identity.xero.com/connect/token';

export const XERO_APIS = {
  accounting: 'https://api.xero.com/api.xro/2.0',
  payrollUk: 'https://api.xero.com/payroll.xro/2.0',
  assets: 'https://api.xero.com/assets.xro/1.0',
  projects: 'https://api.xero.com/projects.xro/2.0',
  files: 'https://api.xero.com/files.xro/1.0',
} as const;

export type XeroApi = keyof typeof XERO_APIS;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Xero access tokens, in memory only. The key always includes the Entra tenant
 * id that owns the connection, so two tenants can never share a token even if
 * a connection id were reused.
 */
const tokenCache = new Map<string, CachedToken>();

export interface XeroClientOptions {
  /** Entra tenant that owns this connection: part of every cache key. */
  ownerTenantId: string;
  connection: XeroConnection;
  /** The Xero organisation to act on. */
  xeroTenantId: string;
  /** Called when Xero rotates an OAuth refresh token, so it can be persisted. */
  onRefreshTokenRotated?: (refreshToken: string) => Promise<void>;
}

export interface XeroRequest {
  api?: XeroApi;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Raw request body (file uploads), sent with `contentType` instead of JSON. */
  rawBody?: ArrayBuffer;
  contentType?: string;
  accept?: string;
  /** Pass a summaryOnly / If-Modified-Since style header if needed. */
  headers?: Record<string, string>;
}

export class XeroClient {
  constructor(private readonly options: XeroClientOptions) {}

  get xeroTenantId() {
    return this.options.xeroTenantId;
  }

  private cacheKey() {
    const { ownerTenantId, connection } = this.options;
    return `${ownerTenantId}:${connection.id}`;
  }

  async accessToken(): Promise<string> {
    const key = this.cacheKey();
    const hit = tokenCache.get(key);
    if (hit && hit.expiresAt - 60_000 > Date.now()) return hit.accessToken;

    const { auth } = this.options.connection;
    let clientId: string;
    let clientSecret: string;
    let body: URLSearchParams;
    if (auth.type === 'custom-connection') {
      clientId = auth.clientId;
      clientSecret = auth.clientSecret;
      body = new URLSearchParams({ grant_type: 'client_credentials' });
    } else {
      clientId = process.env.XERO_CLIENT_ID ?? '';
      clientSecret = process.env.XERO_CLIENT_SECRET ?? '';
      if (!clientId || !clientSecret) {
        throw new ConnectorError('Xero OAuth is not configured on this server.', 500, 'xero');
      }
      body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken });
    }

    const response = await fetch(IDENTITY, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    });
    const token = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!response.ok || !token.access_token) {
      const reason =
        token.error === 'invalid_client'
          ? 'Xero rejected the client ID or secret.'
          : token.error === 'invalid_grant'
            ? 'The Xero connection has expired. Reconnect it in Settings.'
            : `Xero sign-in failed (${token.error ?? response.status}).`;
      throw new ConnectorError(reason, 401, 'xero');
    }
    if (auth.type === 'oauth' && token.refresh_token && token.refresh_token !== auth.refreshToken) {
      auth.refreshToken = token.refresh_token;
      await this.options.onRefreshTokenRotated?.(token.refresh_token);
    }
    tokenCache.set(key, {
      accessToken: token.access_token,
      expiresAt: Date.now() + (token.expires_in ?? 1800) * 1000,
    });
    return token.access_token;
  }

  async request<T>(path: string, request: XeroRequest = {}): Promise<T> {
    const response = await this.send(path, request);
    if (response.status === 204) return undefined as T;
    if (request.accept && request.accept !== 'application/json') {
      return (await response.arrayBuffer()) as T;
    }
    return (await response.json()) as T;
  }

  /** File bytes plus the Content-Type Xero sent (attachments, Files API content). */
  async requestBytes(
    path: string,
    request: XeroRequest = {}
  ): Promise<{ bytes: ArrayBuffer; contentType?: string }> {
    const response = await this.send(path, { accept: '*/*', ...request });
    return {
      bytes: await response.arrayBuffer(),
      contentType: response.headers.get('Content-Type')?.split(';')[0].trim() || undefined,
    };
  }

  private async send(path: string, request: XeroRequest): Promise<Response> {
    const url = new URL(`${XERO_APIS[request.api ?? 'accounting']}/${path.replace(/^\//, '')}`);
    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
    }

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        method: request.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${await this.accessToken()}`,
          'Xero-tenant-id': this.options.xeroTenantId,
          Accept: request.accept ?? 'application/json',
          ...(request.rawBody !== undefined
            ? { 'Content-Type': request.contentType ?? 'application/octet-stream' }
            : request.body !== undefined
              ? { 'Content-Type': 'application/json' }
              : {}),
          ...request.headers,
        },
        body:
          request.rawBody !== undefined
            ? request.rawBody
            : request.body !== undefined
              ? JSON.stringify(request.body)
              : undefined,
        cache: 'no-store',
      });

      if (response.status === 429 && attempt < 2) {
        const wait = Math.min(Number(response.headers.get('Retry-After') ?? 2), 10);
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        continue;
      }
      if (response.status === 401 && attempt === 0) {
        tokenCache.delete(this.cacheKey());
        continue;
      }
      if (!response.ok) throw await toConnectorError(response);
      return response;
    }
  }
}

async function toConnectorError(response: Response): Promise<ConnectorError> {
  const parsed: unknown = await response.json().catch(() => undefined);
  // The Files API sends an array of problems: `[{ type, title, detail }]`.
  const body = (Array.isArray(parsed) ? parsed[0] : parsed) as
    | {
        Message?: string;
        Detail?: string;
        title?: string;
        detail?: string;
        Elements?: { ValidationErrors?: { Message: string }[] }[];
      }
    | undefined;
  const validation = body?.Elements?.flatMap((e) => e.ValidationErrors ?? []).map((e) => e.Message);
  const message =
    (validation?.length ? validation.join(' ') : undefined) ??
    body?.Detail ??
    body?.detail ??
    body?.Message ??
    body?.title ??
    (response.status === 403
      ? 'Xero refused access. The connection may be missing a scope.'
      : response.status === 429
        ? 'Xero rate limit reached. Try again in a minute.'
        : `Xero returned ${response.status}.`);
  return new ConnectorError(message, response.status, 'xero', body);
}

/** Look up the organisations a set of Xero credentials can reach. */
export async function discoverXeroTenants(
  connection: XeroConnection,
  ownerTenantId: string
): Promise<{ tenantId: string; tenantName: string }[]> {
  const client = new XeroClient({ ownerTenantId, connection, xeroTenantId: '' });
  const token = await client.accessToken();
  const response = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw await toConnectorError(response);
  const connections = (await response.json()) as {
    tenantId: string;
    tenantName: string;
    tenantType: string;
  }[];
  return connections.filter((c) => c.tenantType === 'ORGANISATION');
}

/** Xero sends `/Date(1700000000000+0000)/`; most payloads also carry `...DateString`. */
export function xeroDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const ms = /\/Date\((-?\d+)/.exec(value)?.[1];
  if (ms) return new Date(Number(ms)).toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function xeroTimestamp(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const ms = /\/Date\((-?\d+)/.exec(value)?.[1];
  return ms ? new Date(Number(ms)).toISOString() : value;
}

/** Xero's `where` filter needs quotes escaped. */
export function xeroString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
