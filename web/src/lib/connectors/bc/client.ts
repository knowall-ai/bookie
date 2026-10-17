import 'server-only';
import { ConnectorError } from '../types';

export const BC_API = 'https://api.businesscentral.dynamics.com';

export interface BcClientOptions {
  /** Entra tenant that owns the BC environment (the signed-in user's tenant). */
  tenantId: string;
  environment: string;
  companyId: string;
  /** Delegated BC token for the signed-in user. */
  token: () => Promise<string>;
}

export interface BcRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Required by BC for PATCH/DELETE; `*` means "whatever the current version is". */
  etag?: string;
  raw?: boolean;
}

export interface ODataList<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

/** Business Central API v2.0, scoped to one company. */
export class BcClient {
  constructor(private readonly options: BcClientOptions) {}

  get environment() {
    return this.options.environment;
  }

  get tenantId() {
    return this.options.tenantId;
  }

  companyUrl(path = ''): string {
    const { tenantId, environment, companyId } = this.options;
    return `${BC_API}/v2.0/${tenantId}/${encodeURIComponent(environment)}/api/v2.0/companies(${companyId})${path ? `/${path.replace(/^\//, '')}` : ''}`;
  }

  async request<T>(path: string, request: BcRequest = {}): Promise<T> {
    const url = new URL(this.companyUrl(path));
    for (const [name, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(name, String(value));
    }
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        method: request.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${await this.options.token()}`,
          Accept: 'application/json',
          ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(request.etag ? { 'If-Match': request.etag } : {}),
        },
        body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
        cache: 'no-store',
      });
      if (response.status === 429 && attempt < 2) {
        const wait = Math.min(Number(response.headers.get('Retry-After') ?? 2), 10);
        await new Promise((resolve) => setTimeout(resolve, wait * 1000));
        continue;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => undefined)) as
          | { error?: { code?: string; message?: string } }
          | undefined;
        const message =
          body?.error?.message?.replace(/\s*CorrelationId:[\s\S]*$/, '') ??
          (response.status === 401
            ? 'Business Central rejected your sign-in.'
            : response.status === 403
              ? 'You do not have permission for this in Business Central.'
              : `Business Central returned ${response.status}.`);
        throw new ConnectorError(message, response.status, 'business-central', body);
      }
      if (response.status === 204) return undefined as T;
      if (request.raw) return (await response.arrayBuffer()) as T;
      return (await response.json()) as T;
    }
  }

  /** Every page of an OData collection (BC pages at 20,000 by default; we cap pages for safety). */
  async all<T>(path: string, query: BcRequest['query'] = {}, maxPages = 10): Promise<T[]> {
    const first = await this.request<ODataList<T>>(path, { query });
    const items = [...first.value];
    let next = first['@odata.nextLink'];
    for (let pages = 1; next && pages < maxPages; pages++) {
      const response = await fetch(next, {
        headers: { Authorization: `Bearer ${await this.options.token()}`, Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) break;
      const page = (await response.json()) as ODataList<T>;
      items.push(...page.value);
      next = page['@odata.nextLink'];
    }
    return items;
  }
}

export interface BcEnvironment {
  name: string;
  type: 'production' | 'sandbox' | string;
  countryCode?: string;
}

export interface BcCompany {
  id: string;
  name: string;
  displayName?: string;
}

/** Environments the signed-in user can see in their tenant. */
export async function listBcEnvironments(token: string): Promise<BcEnvironment[]> {
  const response = await fetch(`${BC_API}/environments/v1.1`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 401 || response.status === 403 || response.status === 404) return [];
  if (!response.ok) {
    throw new ConnectorError(`Could not list BC environments (${response.status}).`, response.status, 'business-central');
  }
  const body = (await response.json()) as { value: BcEnvironment[] };
  return body.value;
}

export async function listBcCompanies(tenantId: string, environment: string, token: string): Promise<BcCompany[]> {
  const response = await fetch(
    `${BC_API}/v2.0/${tenantId}/${encodeURIComponent(environment)}/api/v2.0/companies?$select=id,name,displayName`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, cache: 'no-store' }
  );
  if (response.status === 401 || response.status === 403 || response.status === 404) return [];
  if (!response.ok) {
    throw new ConnectorError(`Could not list BC companies (${response.status}).`, response.status, 'business-central');
  }
  return ((await response.json()) as { value: BcCompany[] }).value;
}

/** OData string literal. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Deep link into the BC web client. */
export function bcWebClientLink(
  tenantId: string,
  environment: string,
  companyName: string,
  page: number,
  filter?: string
): string {
  const params = new URLSearchParams({ company: companyName, page: String(page) });
  if (filter) params.set('filter', filter);
  return `https://businesscentral.dynamics.com/${tenantId}/${encodeURIComponent(environment)}?${params}`;
}
