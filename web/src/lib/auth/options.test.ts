import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveUserType, signInIdentity } from './options';

const MEMBER_UPN = 'alex.morgan@contoso.example';
const GUEST_UPN = 'jordan.lee_fabrikam.example#EXT#@contoso.onmicrosoft.com';

describe('resolveUserType', () => {
  it('is a member when Graph says Member', () => {
    expect(resolveUserType({ userType: 'Member', userPrincipalName: MEMBER_UPN })).toBe('Member');
  });

  it('is a member when userType is blank (older accounts) and the UPN is not #EXT#', () => {
    expect(resolveUserType({ userType: null, userPrincipalName: MEMBER_UPN })).toBe('Member');
    expect(resolveUserType({ userPrincipalName: MEMBER_UPN })).toBe('Member');
  });

  it('is a guest when userType is blank but the UPN is a B2B #EXT# one', () => {
    expect(resolveUserType({ userType: null, userPrincipalName: GUEST_UPN })).toBe('Guest');
    expect(resolveUserType({ userPrincipalName: GUEST_UPN.replace('#EXT#', '#ext#') })).toBe(
      'Guest'
    );
  });

  it('is a guest when userType is blank and there is no UPN to check', () => {
    expect(resolveUserType({ userType: null })).toBe('Guest');
    expect(resolveUserType({})).toBe('Guest');
  });

  it('is a guest when Graph says Guest, or anything else', () => {
    expect(resolveUserType({ userType: 'Guest', userPrincipalName: MEMBER_UPN })).toBe('Guest');
    expect(resolveUserType({ userType: 'member', userPrincipalName: MEMBER_UPN })).toBe('Guest');
    expect(resolveUserType({ userType: '', userPrincipalName: MEMBER_UPN })).toBe('Guest');
  });

  it('is a guest when the /me call failed (fail closed)', () => {
    expect(resolveUserType(null)).toBe('Guest');
  });
});

describe('signInIdentity userType', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('treats a blank Graph userType with a home-tenant UPN as a member', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ userType: null, mail: MEMBER_UPN, userPrincipalName: MEMBER_UPN })
        )
    );
    await expect(signInIdentity('token', {})).resolves.toEqual({
      userType: 'Member',
      email: MEMBER_UPN,
    });
  });

  it('treats a blank Graph userType with an #EXT# UPN as a guest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ userType: null, userPrincipalName: GUEST_UPN }))
    );
    await expect(signInIdentity('token', {})).resolves.toEqual({
      userType: 'Guest',
      email: 'jordan.lee@fabrikam.example',
    });
  });

  it('treats the user as a guest when the /me call throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(signInIdentity('token', { email: MEMBER_UPN })).resolves.toEqual({
      userType: 'Guest',
      email: MEMBER_UPN,
    });
  });
});
