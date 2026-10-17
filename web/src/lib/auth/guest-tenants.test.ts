import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestProviderId, parseGuestTenants } from './guest-tenants';
import { externalUpnToEmail, signInIdentity } from './options';

const T1 = '11111111-aaaa-4bbb-8ccc-000000000001';
const T2 = '22222222-aaaa-4bbb-8ccc-000000000002';

describe('guest host tenants (BOOKIE_GUEST_TENANTS)', () => {
  it('parses tenantId:Name pairs into providers named after the first 8 characters', () => {
    expect(parseGuestTenants(`${T1}:Northwind Traders; ${T2.toUpperCase()}:Fabrikam: UK`)).toEqual([
      { tenantId: T1, name: 'Northwind Traders', providerId: 'azure-ad-11111111' },
      { tenantId: T2, name: 'Fabrikam: UK', providerId: 'azure-ad-22222222' },
    ]);
    expect(guestProviderId(T1)).toBe('azure-ad-11111111');
  });

  it('is empty when unset and skips malformed or duplicate entries', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseGuestTenants(undefined)).toEqual([]);
    expect(parseGuestTenants('  ')).toEqual([]);
    expect(parseGuestTenants(`not-a-guid:Name;${T1};${T1}:One;${T1}:Two`)).toEqual([
      { tenantId: T1, name: 'One', providerId: 'azure-ad-11111111' },
    ]);
  });
});

describe('sign-in identity', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns a B2B guest UPN back into their email', () => {
    expect(externalUpnToEmail('jordan.lee_fabrikam.example#EXT#@contoso.onmicrosoft.com')).toBe(
      'jordan.lee@fabrikam.example'
    );
    expect(externalUpnToEmail('alex@contoso.example')).toBe('alex@contoso.example');
  });

  it('reads userType and mail from Graph /me with the sign-in token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        userType: 'Guest',
        mail: 'jordan.lee@fabrikam.example',
        userPrincipalName: 'jordan.lee_fabrikam.example#EXT#@contoso.onmicrosoft.com',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(signInIdentity('token', {})).resolves.toEqual({
      userType: 'Guest',
      email: 'jordan.lee@fabrikam.example',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://graph.microsoft.com/v1.0/me?$select=userType,mail,userPrincipalName'
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
  });

  it('recognises members and falls back to the id token email', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ userType: 'Member', mail: null }))
    );
    await expect(signInIdentity('token', { email: 'alex@contoso.example' })).resolves.toEqual({
      userType: 'Member',
      email: 'alex@contoso.example',
    });
  });

  it('treats the user as a guest when Graph cannot say (fail closed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    await expect(
      signInIdentity('token', { preferred_username: 'alex@contoso.example' })
    ).resolves.toEqual({ userType: 'Guest', email: 'alex@contoso.example' });
    await expect(signInIdentity(undefined, {})).resolves.toEqual({ userType: 'Guest', email: '' });
  });
});
