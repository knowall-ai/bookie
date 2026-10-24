import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWALL_TENANT_ID } from './approved-tenants';

/*
 * The approved-organisations gate, end to end through the real auth context:
 * the session cookie and its decoding are mocked, everything after is real.
 */

let token: Record<string, unknown> | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'next-auth.session-token' && token ? { value: 'cookie' } : undefined,
  }),
}));
vi.mock('next-auth/jwt', () => ({ decode: async () => token }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock('./tokens', () => ({
  redeemRefreshToken: async () => {
    throw new Error('no tokens in tests');
  },
}));

const { getAuthContext, getSignIn, requireAuth } = await import('./context');
const { bookieContext } = await import('@/lib/bookie/session');
const { GET: photo } = await import('@/app/api/me/photo/route');
const { GET: pending } = await import('@/app/api/email/pending/route');
const { listOrgs } = await import('@/lib/connectors/registry');

const FABRIKAM = '11111111-2222-3333-4444-555555555555';

function signedIn(tenantId: string | undefined, userType: 'Member' | 'Guest' = 'Member') {
  token = {
    refreshToken: 'refresh',
    tenantId,
    oid: '00000000-0000-0000-0000-0000000000a1',
    userType,
    name: 'Casey Rivera',
    email: 'casey.rivera@fabrikam.example',
  };
}

beforeEach(() => {
  token = null;
  vi.stubEnv('BOOKIE_DEV_AUTH', '');
  vi.stubEnv('APPROVED_TENANT_IDS', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('approved organisations gate', () => {
  it("lets KnowAll's own tenant in, members and B2B guests alike", async () => {
    signedIn(KNOWALL_TENANT_ID);
    expect((await getAuthContext())?.user.tenantId).toBe(KNOWALL_TENANT_ID);
    signedIn(KNOWALL_TENANT_ID, 'Guest');
    const guest = await getAuthContext();
    // Approval doesn't make a guest a member: per-person access still applies.
    expect(guest?.user.userType).toBe('Guest');
    expect((await requireAuth())?.user.userType).toBe('Guest');
  });

  it('lets in a tenant listed in APPROVED_TENANT_IDS', async () => {
    vi.stubEnv('APPROVED_TENANT_IDS', `${KNOWALL_TENANT_ID},${FABRIKAM.toUpperCase()}`);
    signedIn(FABRIKAM);
    expect((await getAuthContext())?.user.tenantId).toBe(FABRIKAM);
  });

  it('gives an unapproved tenant no user, sends pages to /not-approved and routes 401', async () => {
    signedIn(FABRIKAM);
    expect(await getAuthContext()).toBeNull();
    // The "not set up yet" page can still see who signed in.
    expect((await getSignIn())?.user.tenantId).toBe(FABRIKAM);
    await expect(requireAuth('/portal')).rejects.toThrow('REDIRECT /not-approved');

    expect((await photo()).status).toBe(401);
    expect(await bookieContext('demo.contoso')).toMatchObject({ ok: false, status: 401 });
    expect(await (await pending()).json()).toEqual({ count: 0 });
  });

  it('blocks a sign-in with a missing or malformed tid', async () => {
    for (const tid of [undefined, '', 'organizations', 'not-a-guid']) {
      signedIn(tid);
      expect(await getAuthContext()).toBeNull();
    }
    vi.stubEnv('APPROVED_TENANT_IDS', 'not-a-guid');
    signedIn('not-a-guid');
    expect(await getAuthContext()).toBeNull();
  });

  it('still sends people who are not signed in to the sign-in page', async () => {
    await expect(requireAuth('/portal/settings')).rejects.toThrow(
      'REDIRECT /signin?callbackUrl=%2Fportal%2Fsettings'
    );
  });

  it('applies the fictional demo sign-ins the same way', async () => {
    vi.stubEnv('BOOKIE_DEV_AUTH', 'demo-unapproved');
    expect(await getAuthContext()).toBeNull();
    await expect(requireAuth()).rejects.toThrow('REDIRECT /not-approved');
    expect(await bookieContext('demo.contoso')).toMatchObject({ ok: false, status: 401 });
  });

  it('keeps per-person access on top for approved organisations', async () => {
    vi.stubEnv('BOOKIE_DEV_AUTH', 'demo');
    const member = (await getAuthContext())!;
    expect((await listOrgs(member)).orgs.map((o) => o.key)).toEqual([
      'demo.contoso',
      'demo.contoso-wholesale',
    ]);
    vi.stubEnv('BOOKIE_DEV_AUTH', 'demo-guest');
    const guest = (await getAuthContext())!;
    expect(guest.user.userType).toBe('Guest');
    expect((await listOrgs(guest)).orgs.map((o) => o.key)).toEqual(['demo.contoso']);
  });
});
