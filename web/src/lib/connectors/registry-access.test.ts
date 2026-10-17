import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/auth/context';
import { DEMO_GUEST, DEMO_MEMBER } from '@/lib/auth/dev';

/*
 * Organisation access end to end, over the demo tenant: the demo store is
 * seeded with one access entry (the guest accountant sees Contoso Coffee
 * Roasters only). Each test uses its own tenant id so the in-memory store
 * starts fresh.
 */

let current: AuthContext | null = null;
vi.mock('@/lib/auth/context', () => ({
  getAuthContext: async () => current,
  requireAuth: async () => {
    if (!current) throw new Error('signed out');
    return current;
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { listOrgs, getConnector } = await import('./registry');
const { bookieContext } = await import('@/lib/bookie/session');
const { liveSource } = await import('@/lib/webhooks/live');
const { updateAccessSettings, updateConnectorSettings } = await import('@/lib/connections');
const { saveAccessPersonAction, setMembersSeeAllAction, updateSettingsAction } =
  await import('@/lib/portal/actions/settings');
const { SettingsAccessError } = await import('@/lib/auth/access');

let tenant = 0;
let member: AuthContext;
let guest: AuthContext;

function demoAuth(user: AuthContext['user'], tenantId: string): AuthContext {
  return {
    mode: 'demo',
    user: { ...user, tenantId },
    getToken: async () => {
      throw new Error('no tokens in tests');
    },
  };
}

const keys = async (auth: AuthContext) => (await listOrgs(auth)).orgs.map((o) => o.key);

beforeEach(() => {
  const tenantId = `00000000-0000-0000-0000-${String(++tenant).padStart(12, '0')}`;
  member = demoAuth(DEMO_MEMBER, tenantId);
  guest = demoAuth(DEMO_GUEST, tenantId);
  current = null;
});

describe('organisation access across Bookie', () => {
  it('shows members every demo organisation by default', async () => {
    expect(await keys(member)).toEqual(['demo.contoso', 'demo.contoso-wholesale']);
  });

  it('shows the guest only the organisation in their entry', async () => {
    expect(await keys(guest)).toEqual(['demo.contoso']);
    expect((await listOrgs(guest)).allOrgs).toHaveLength(2);
  });

  it('matches the guest entry case-insensitively', async () => {
    const shouty = demoAuth(
      { ...DEMO_GUEST, email: DEMO_GUEST.email.toUpperCase() },
      guest.user.tenantId
    );
    expect(await keys(shouty)).toEqual(['demo.contoso']);
  });

  it('shows a guest with no entry nothing', async () => {
    const stranger = demoAuth(
      { ...DEMO_GUEST, id: 'other-guest', email: 'someone@northwind.example' },
      guest.user.tenantId
    );
    expect(await keys(stranger)).toEqual([]);
    await expect(getConnector(stranger, 'demo.contoso')).rejects.toMatchObject({ status: 404 });
  });

  it("won't let a guest reach a non-granted org key directly", async () => {
    await expect(getConnector(guest, 'demo.contoso-wholesale')).rejects.toMatchObject({
      status: 404,
    });
    await expect(getConnector(guest, 'demo.contoso')).resolves.toBeDefined();

    // Bookie's chat, tool and voice routes resolve orgs through bookieContext.
    current = guest;
    expect(await bookieContext('demo.contoso-wholesale')).toEqual({
      ok: false,
      status: 404,
      error: 'Organisation not found.',
    });
    expect(await bookieContext('demo.contoso')).toMatchObject({ ok: true });

    // The Live feed (webhook events route) resolves orgs through liveSource.
    expect(await liveSource(guest, 'demo.contoso-wholesale')).toBeUndefined();
    expect(await liveSource(guest, 'demo.contoso')).toMatchObject({ enabled: true });
  });

  it("won't let a guest escalate by editing settings", async () => {
    const grantAll = {
      type: 'upsert' as const,
      person: { email: DEMO_GUEST.email, orgKeys: 'all' as const },
    };
    await expect(updateAccessSettings(guest, grantAll)).rejects.toBeInstanceOf(SettingsAccessError);
    await expect(updateConnectorSettings(guest, { bcEnabled: false })).rejects.toBeInstanceOf(
      SettingsAccessError
    );

    current = guest;
    const action = await saveAccessPersonAction({ email: DEMO_GUEST.email, orgKeys: 'all' });
    expect(action).toMatchObject({ ok: false, error: expect.stringMatching(/administrators/) });
    expect(await setMembersSeeAllAction(false)).toMatchObject({ ok: false });
    expect(await updateSettingsAction({ xeroEnabled: false })).toMatchObject({ ok: false });

    expect(await keys(guest)).toEqual(['demo.contoso']);
    expect(await keys(member)).toHaveLength(2);
  });

  it('lets a member grant and restrict access', async () => {
    current = member;
    expect(
      await saveAccessPersonAction({
        email: ' Jordan.Lee@Fabrikam.example ',
        name: 'Jordan Lee',
        orgKeys: ['demo.contoso-wholesale', 'demo.contoso-wholesale'],
      })
    ).toEqual({ ok: true, data: undefined });
    expect(await keys(guest)).toEqual(['demo.contoso-wholesale']);

    expect(await setMembersSeeAllAction(false)).toEqual({ ok: true, data: undefined });
    expect(await keys(member)).toEqual([]);
    await updateAccessSettings(member, {
      type: 'upsert',
      person: { email: DEMO_MEMBER.email, orgKeys: ['demo.contoso'] },
    });
    expect(await keys(member)).toEqual(['demo.contoso']);
  });

  it('rejects invalid access input', async () => {
    current = member;
    expect(await saveAccessPersonAction({ email: 'not an email', orgKeys: [] })).toMatchObject({
      ok: false,
      error: 'Enter a valid email address.',
    });
    expect(
      await saveAccessPersonAction({ email: 'a@example.com', orgKeys: ['../../etc'] })
    ).toMatchObject({ ok: false });
  });
});
