import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/auth/context';
import {
  directorySearchUrl,
  getDirectoryPerson,
  searchDirectory,
  signInStatuses,
  signInStatusFor,
  toDirectoryPerson,
  type AppAssignments,
} from './graph';
import { matchesDirectoryQuery, searchDemoDirectory, DEMO_DIRECTORY } from './demo';
import { DirectoryError } from './types';

/* Fictional ids and people only. */
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const G1 = '11111111-1111-4111-8111-111111111111';
const G2 = '22222222-2222-4222-8222-222222222222';
const SP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const entra: AuthContext = {
  mode: 'entra',
  user: {
    id: A,
    tenantId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    name: 'Alex Morgan',
    email: 'alex@contoso.example',
    userType: 'Member',
  },
  getToken: async () => 'graph-token',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('toDirectoryPerson', () => {
  it('uses mail and the Entra user type', () => {
    expect(
      toDirectoryPerson({
        id: A,
        displayName: 'Priya Shah',
        mail: 'priya@contoso.example',
        userPrincipalName: 'priya@contoso.example',
        userType: 'Member',
      })
    ).toEqual({ id: A, name: 'Priya Shah', email: 'priya@contoso.example', userType: 'Member' });
  });

  it("derives a guest's home address from their #EXT# UPN when mail is empty", () => {
    expect(
      toDirectoryPerson({
        id: B,
        displayName: 'Jordan Lee',
        mail: null,
        userPrincipalName: 'jordan.lee_fabrikam.example#EXT#@contoso.onmicrosoft.com',
        userType: 'Guest',
      })
    ).toEqual({
      id: B,
      name: 'Jordan Lee',
      email: 'jordan.lee@fabrikam.example',
      userType: 'Guest',
    });
  });

  it('treats a blank user type as a member unless the UPN is a guest one', () => {
    const blank = { id: A, displayName: 'Sam', mail: 'sam@contoso.example', userType: null };
    expect(
      toDirectoryPerson({ ...blank, userPrincipalName: 'sam@contoso.example' })?.userType
    ).toBe('Member');
    expect(
      toDirectoryPerson({
        ...blank,
        userPrincipalName: 'sam_x.example#EXT#@contoso.onmicrosoft.com',
      })?.userType
    ).toBe('Guest');
    // Not returned at all (e.g. only the basic profile is readable): same rule.
    expect(
      toDirectoryPerson({
        id: A,
        mail: 'sam@contoso.example',
        userPrincipalName: 'sam@contoso.example',
      })
    ).toMatchObject({ userType: 'Member', name: 'sam@contoso.example' });
    expect(toDirectoryPerson({ ...blank, userType: 'Other' })?.userType).toBe('Guest');
  });

  it('drops entries without a valid id or any address', () => {
    expect(toDirectoryPerson({ id: 'nope', mail: 'a@contoso.example' })).toBeUndefined();
    expect(toDirectoryPerson({ id: A, mail: null, userPrincipalName: null })).toBeUndefined();
  });
});

describe('directorySearchUrl', () => {
  it('builds the exact Graph URL: %20 for spaces and a literal $ in the parameter names', () => {
    expect(directorySearchUrl('sam taylor')).toBe(
      'https://graph.microsoft.com/v1.0/users' +
        '?$search=%22displayName%3Asam%20taylor%22%20OR%20%22mail%3Asam%20taylor%22' +
        '&$select=id,displayName,mail,userPrincipalName,userType&$top=10'
    );
    expect(directorySearchUrl('sam taylor')).not.toMatch(/\+|%24/);
  });

  it('searches displayName and mail, with the fields and page size Bookie needs', () => {
    const url = new URL(directorySearchUrl('jo  lee'));
    expect(url.pathname).toBe('/v1.0/users');
    expect(url.searchParams.get('$search')).toBe('"displayName:jo lee" OR "mail:jo lee"');
    expect(url.searchParams.get('$select')).toBe('id,displayName,mail,userPrincipalName,userType');
    expect(url.searchParams.get('$top')).toBe('10');
  });

  it("strips quotes and backslashes so the query can't escape $search", () => {
    const url = new URL(directorySearchUrl('a" OR "mail:\\b'));
    expect(url.searchParams.get('$search')).toBe(
      '"displayName:a OR mail: b" OR "mail:a OR mail: b"'
    );
  });
});

describe('searchDirectory', () => {
  it('calls Graph as the signed-in member with ConsistencyLevel: eventual', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        value: [
          { id: A, displayName: 'Priya Shah', mail: 'priya@contoso.example', userType: 'Member' },
          { id: 'bad', displayName: 'Broken' },
        ],
      })
    );
    expect(await searchDirectory(entra, 'pri')).toEqual([
      { id: A, name: 'Priya Shah', email: 'priya@contoso.example', userType: 'Member' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/users?');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer graph-token',
      ConsistencyLevel: 'eventual',
    });
  });

  it('explains the missing consent when Graph says 403', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'Authorization_RequestDenied' } }, 403));
    const error = await searchDirectory(entra, 'pri').catch((e) => e);
    expect(error).toBeInstanceOf(DirectoryError);
    expect(error.message).toMatch(/User\.ReadBasic\.All/);
  });

  it('asks to sign in again on 401, without blaming the permission', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'InvalidAuthenticationToken' } }, 401));
    const error = await searchDirectory(entra, 'pri').catch((e) => e);
    expect(error).toBeInstanceOf(DirectoryError);
    expect(error.status).toBe(401);
    expect(error.message).toMatch(/signing in again/);
    expect(error.message).not.toMatch(/User\.ReadBasic\.All/);
  });

  it('returns no one when Graph answers with something that is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    expect(await searchDirectory(entra, 'pri')).toEqual([]);
  });

  it('fails with a plain message on other Graph errors', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(searchDirectory(entra, 'pri')).rejects.toThrow(/didn’t answer/);
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(searchDirectory(entra, 'pri')).rejects.toThrow(/didn’t answer/);
  });

  it('fails cleanly without a Graph token', async () => {
    const noToken = { ...entra, getToken: async () => Promise.reject(new Error('x')) };
    await expect(searchDirectory(noToken, 'pri')).rejects.toBeInstanceOf(DirectoryError);
  });

  it('searches the fictional directory in demo mode, without Graph', async () => {
    const demo = { ...entra, mode: 'demo' as const };
    expect((await searchDirectory(demo, 'contoso')).length).toBeGreaterThan(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getDirectoryPerson', () => {
  it('looks a person up by id, and says undefined when they are not there', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ id: A, displayName: 'Priya', mail: 'p@contoso.example' })
    );
    expect(await getDirectoryPerson(entra, A)).toMatchObject({ id: A, email: 'p@contoso.example' });
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/users/${A}?$select=`);
    fetchMock.mockResolvedValueOnce(json({}, 404));
    expect(await getDirectoryPerson(entra, B)).toBeUndefined();
    expect(await getDirectoryPerson(entra, 'not-a-guid')).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports missing consent rather than "not found"', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 403));
    await expect(getDirectoryPerson(entra, A)).rejects.toThrow(/administrator/);
  });

  it('asks to sign in again on 401', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    await expect(getDirectoryPerson(entra, A)).rejects.toThrow(/signing in again/);
  });
});

describe('signInStatusFor', () => {
  const base: AppAssignments = { required: true, users: new Set([A]), groups: [], complete: true };

  it('is ok for everyone when assignment is not required', () => {
    expect(signInStatusFor(B, { ...base, required: false })).toBe('ok');
  });

  it('is ok when assigned directly, not-assigned when nobody else is', () => {
    expect(signInStatusFor(A, base)).toBe('ok');
    expect(signInStatusFor(B, base)).toBe('not-assigned');
  });

  it('uses group membership when groups are assigned, and stays silent without it', () => {
    const groups = { ...base, groups: [G1] };
    expect(signInStatusFor(B, groups)).toBeUndefined();
    expect(signInStatusFor(B, groups, [G1])).toBe('ok');
    expect(signInStatusFor(B, groups, [G2])).toBe('not-assigned');
    expect(signInStatusFor(B, groups, [])).toBe('not-assigned');
  });

  it("stays silent when the assignment list wasn't read to the end", () => {
    expect(signInStatusFor(B, { ...base, complete: false })).toBeUndefined();
    expect(signInStatusFor(A, { ...base, complete: false })).toBe('ok');
  });
});

describe('signInStatuses', () => {
  beforeEach(() => vi.stubEnv('AZURE_AD_CLIENT_ID', 'app-client-id'));

  const sp = (required: boolean) => json({ id: SP, appRoleAssignmentRequired: required });

  it('resolves the service principal from AZURE_AD_CLIENT_ID and reads its assignments', async () => {
    fetchMock
      .mockResolvedValueOnce(sp(true))
      .mockResolvedValueOnce(json({ value: [{ principalId: A, principalType: 'User' }] }));
    expect(await signInStatuses(entra, [A, B])).toEqual({ [A]: 'ok', [B]: 'not-assigned' });
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/servicePrincipals(appId='app-client-id')?$select=id,appRoleAssignmentRequired"
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      `/servicePrincipals/${SP}/appRoleAssignedTo`
    );
  });

  it('says ok for everyone, without listing assignments, when assignment is not required', async () => {
    fetchMock.mockResolvedValueOnce(sp(false));
    expect(await signInStatuses(entra, [A, B])).toEqual({ [A]: 'ok', [B]: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows paging and checks group membership for people not assigned directly', async () => {
    fetchMock
      .mockResolvedValueOnce(sp(true))
      .mockResolvedValueOnce(
        json({
          value: [{ principalId: G1, principalType: 'Group' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next-page',
        })
      )
      .mockResolvedValueOnce(json({ value: [{ principalId: A, principalType: 'User' }] }))
      .mockResolvedValueOnce(json({ value: [G1] }));
    expect(await signInStatuses(entra, [A, B])).toEqual({ [A]: 'ok', [B]: 'ok' });
    const [url, init] = fetchMock.mock.calls[3];
    expect(String(url)).toContain(`/users/${B}/checkMemberGroups`);
    expect(JSON.parse(init.body)).toEqual({ groupIds: [G1] });
  });

  it('leaves a person out when their group membership cannot be checked', async () => {
    fetchMock
      .mockResolvedValueOnce(sp(true))
      .mockResolvedValueOnce(json({ value: [{ principalId: G1, principalType: 'Group' }] }))
      .mockResolvedValueOnce(json({}, 403));
    expect(await signInStatuses(entra, [B])).toEqual({});
  });

  it('treats an assignment answer that is not JSON as unknown, not as "nobody assigned"', async () => {
    fetchMock.mockResolvedValueOnce(sp(true)).mockResolvedValueOnce(new Response('oops'));
    expect(await signInStatuses(entra, [A])).toEqual({});
    fetchMock
      .mockResolvedValueOnce(sp(true))
      .mockResolvedValueOnce(json({ value: [{ principalId: G1, principalType: 'Group' }] }))
      .mockResolvedValueOnce(new Response('oops'));
    expect(await signInStatuses(entra, [B])).toEqual({});
    fetchMock.mockResolvedValueOnce(new Response('oops'));
    expect(await signInStatuses(entra, [A])).toEqual({});
  });

  it('shows nothing when the permission is missing or Graph fails', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 403));
    expect(await signInStatuses(entra, [A])).toEqual({});
    fetchMock.mockResolvedValueOnce(sp(true)).mockResolvedValueOnce(json({}, 403));
    expect(await signInStatuses(entra, [A])).toEqual({});
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect(await signInStatuses(entra, [A])).toEqual({});
    const noToken = { ...entra, getToken: async () => Promise.reject(new Error('x')) };
    expect(await signInStatuses(noToken, [A])).toEqual({});
  });

  it('makes no calls without people to check or without a client id', async () => {
    expect(await signInStatuses(entra, [])).toEqual({});
    expect(await signInStatuses(entra, ['not-a-guid'])).toEqual({});
    vi.stubEnv('AZURE_AD_CLIENT_ID', '');
    expect(await signInStatuses(entra, [A])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the fictional assignments in demo mode', async () => {
    const demo = { ...entra, mode: 'demo' as const };
    const sam = DEMO_DIRECTORY.find((p) => p.name === 'Sam Taylor')!.id;
    const priya = DEMO_DIRECTORY.find((p) => p.name === 'Priya Shah')!.id;
    expect(await signInStatuses(demo, [sam, priya, B])).toEqual({
      [sam]: 'not-assigned',
      [priya]: 'ok',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('the demo directory', () => {
  it('matches word prefixes of names and emails, case-insensitively', () => {
    const priya = DEMO_DIRECTORY.find((p) => p.name === 'Priya Shah')!;
    expect(matchesDirectoryQuery(priya, 'SHA')).toBe(true);
    expect(matchesDirectoryQuery(priya, 'priya.shah@')).toBe(true);
    expect(matchesDirectoryQuery(priya, 'riya')).toBe(false);
    expect(matchesDirectoryQuery(priya, ' ')).toBe(false);
  });

  it('has Contoso members and one guest, all fictional', () => {
    expect(DEMO_DIRECTORY.filter((p) => p.userType === 'Guest')).toHaveLength(1);
    for (const p of DEMO_DIRECTORY) expect(p.email).toMatch(/@(contoso|fabrikam)\.example$/);
    expect(searchDemoDirectory('contoso', 2)).toHaveLength(2);
  });
});
