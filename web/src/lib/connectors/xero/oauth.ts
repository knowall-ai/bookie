import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Xero OAuth 2.0 (authorisation code) for the standard "Connect to Xero" flow.
 * Apps created after 2 March 2026 must request granular scopes; the exact list
 * is configurable so it can track Xero's scope page without a code change.
 */
export const DEFAULT_XERO_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'accounting.invoices',
  'accounting.payments',
  'accounting.banktransactions',
  'accounting.manualjournals',
  'accounting.contacts',
  'accounting.settings',
  'accounting.attachments',
  'accounting.budgets.read',
  'accounting.reports.aged.read',
  'accounting.reports.balancesheet.read',
  'accounting.reports.profitandloss.read',
  'accounting.reports.trialbalance.read',
  'accounting.reports.banksummary.read',
  'accounting.reports.executivesummary.read',
  'payroll.employees.read',
  'payroll.payruns.read',
  'projects.read',
  'assets.read',
].join(' ');

export function xeroOAuthConfigured(): boolean {
  return !!process.env.XERO_CLIENT_ID && !!process.env.XERO_CLIENT_SECRET;
}

export function xeroRedirectUri(): string {
  return `${process.env.NEXTAUTH_URL ?? 'http://localhost:3103'}/api/xero/callback`;
}

interface StatePayload {
  tenantId: string;
  userId: string;
  nonce: string;
  issuedAt: number;
}

function sign(body: string) {
  return createHmac('sha256', process.env.NEXTAUTH_SECRET ?? '')
    .update(`xero-state:${body}`)
    .digest('base64url');
}

/** State bound to the signed-in tenant and user, so a callback can't be replayed into another tenant. */
export function createState(tenantId: string, userId: string): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({ tenantId, userId, nonce, issuedAt: Date.now() } satisfies StatePayload)
  ).toString('base64url');
  return { state: `${body}.${sign(body)}`, nonce };
}

export function verifyState(
  state: string,
  expected: { tenantId: string; userId: string; nonce?: string }
): boolean {
  const [body, signature] = state.split('.');
  if (!body || !signature) return false;
  const good = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return false;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as StatePayload;
  return (
    payload.tenantId === expected.tenantId &&
    payload.userId === expected.userId &&
    !!expected.nonce &&
    payload.nonce === expected.nonce &&
    Date.now() - payload.issuedAt < 10 * 60_000
  );
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID ?? '',
    redirect_uri: xeroRedirectUri(),
    scope: process.env.XERO_OAUTH_SCOPES ?? DEFAULT_XERO_SCOPES,
    state,
  });
  return `https://login.xero.com/identity/connect/authorize?${params}`;
}

export async function exchangeCode(
  code: string
): Promise<{ refreshToken: string; accessToken: string }> {
  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: xeroRedirectUri(),
    }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token || !body.refresh_token) {
    throw new Error(`Xero did not complete the connection (${body.error ?? response.status}).`);
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}
