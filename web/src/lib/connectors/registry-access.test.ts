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
const { configStoreFor } = await import('@/lib/config');
const { addAccessPersonAction, removeAccessPersonAction, searchDirectoryAction } =
  await import('@/lib/portal/actions/settings');

const SAM = '00000000-0000-0000-0000-00000000d304';

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

  it('only changes the organisations of people already listed', async () => {
    current = member;
    expect(
      await saveAccessPersonAction({ email: 'robin@example.com', orgKeys: 'all' })
    ).toMatchObject({ ok: false, error: expect.stringMatching(/isn’t listed/) });
    const settings = await configStoreFor(member).getSettings();
    expect(settings.access.people.map((p) => p.email)).toEqual([DEMO_GUEST.email]);
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

describe('the directory people picker (demo directory)', () => {
  it('searches the directory for members, with Member/Guest', async () => {
    current = member;
    expect(await searchDirectoryAction(' sam ')).toEqual({
      ok: true,
      data: [
        { id: SAM, name: 'Sam Taylor', email: 'sam.taylor@contoso.example', userType: 'Member' },
      ],
    });
    expect(await searchDirectoryAction('fabrikam')).toMatchObject({
      ok: true,
      data: [{ name: 'Jordan Lee', userType: 'Guest' }],
    });
  });

  it('needs at least 2 characters', async () => {
    current = member;
    expect(await searchDirectoryAction('s')).toEqual({
      ok: false,
      error: 'Type at least 2 characters.',
    });
  });

  it("won't let a guest search the directory or add people", async () => {
    current = guest;
    expect(await searchDirectoryAction('sam')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/administrators/),
    });
    expect(await addAccessPersonAction(SAM)).toMatchObject({ ok: false });
  });

  it('adds a picked person with their Entra object id and no organisations', async () => {
    current = member;
    const sam = { userId: SAM, email: 'sam.taylor@contoso.example' };
    expect(await addAccessPersonAction(SAM)).toEqual({
      ok: true,
      data: { name: 'Sam Taylor', email: sam.email },
    });
    expect((await configStoreFor(member).getSettings()).access.people).toContainEqual({
      ...sam,
      name: 'Sam Taylor',
      orgKeys: [],
    });

    expect(await saveAccessPersonAction({ ...sam, orgKeys: ['demo.contoso'] })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await removeAccessPersonAction(sam)).toEqual({ ok: true, data: undefined });
    expect((await configStoreFor(member).getSettings()).access.people).toHaveLength(1);
  });

  it('links an email-only entry to the directory and keeps its organisations', async () => {
    current = member;
    expect(await addAccessPersonAction(DEMO_GUEST.id)).toMatchObject({ ok: true });
    expect((await configStoreFor(member).getSettings()).access.people).toEqual([
      {
        userId: DEMO_GUEST.id,
        email: DEMO_GUEST.email,
        name: DEMO_GUEST.name,
        orgKeys: ['demo.contoso'],
      },
    ]);
    expect(await keys(guest)).toEqual(['demo.contoso']);
    // Another account that happens to use the guest's address doesn't inherit the entry.
    const lookalike = demoAuth(
      { ...DEMO_GUEST, id: '33333333-3333-4333-8333-333333333333' },
      guest.user.tenantId
    );
    expect(await keys(lookalike)).toEqual([]);
  });

  it("won't add someone who isn't in the directory", async () => {
    current = member;
    expect(await addAccessPersonAction('44444444-4444-4444-8444-444444444444')).toEqual({
      ok: false,
      error: 'That person isn’t in your Microsoft 365 directory.',
    });
    expect(await addAccessPersonAction('not-an-id')).toMatchObject({ ok: false });
  });
});
