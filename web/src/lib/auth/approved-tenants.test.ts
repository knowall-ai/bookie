import { afterEach, describe, expect, it, vi } from 'vitest';
import { isApprovedTenant, normaliseTenantId, parseApprovedTenantIds } from './approved-tenants';

const FABRIKAM = '11111111-2222-3333-4444-555555555555';
const NORTHWIND = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('approved organisations', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('approves nobody when APPROVED_TENANT_IDS is empty: there is no built-in tenant', () => {
    expect(isApprovedTenant(FABRIKAM, '')).toBe(false);
    expect(isApprovedTenant(FABRIKAM, undefined)).toBe(false);
  });

  it('accepts commas, semicolons and spaces between tenant ids', () => {
    for (const sep of [',', ';', ' ', '\n']) {
      expect(isApprovedTenant(NORTHWIND, `${FABRIKAM}${sep}${NORTHWIND}`)).toBe(true);
    }
  });

  it('warns about a malformed entry once, not on every check', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw = `${FABRIKAM},not-a-guid`;
    for (let i = 0; i < 3; i++) expect(isApprovedTenant(FABRIKAM, raw)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('approves tenants listed in APPROVED_TENANT_IDS, compared lowercased', () => {
    const raw = ` ${FABRIKAM.toUpperCase()} , ${NORTHWIND}`;
    expect(isApprovedTenant(FABRIKAM, raw)).toBe(true);
    expect(isApprovedTenant(NORTHWIND.toUpperCase(), raw)).toBe(true);
  });

  it('reads APPROVED_TENANT_IDS from the environment by default', () => {
    vi.stubEnv('APPROVED_TENANT_IDS', FABRIKAM);
    expect(isApprovedTenant(FABRIKAM)).toBe(true);
    expect(isApprovedTenant(NORTHWIND)).toBe(false);
  });

  it('refuses a tenant that is not listed', () => {
    expect(isApprovedTenant(NORTHWIND, FABRIKAM)).toBe(false);
    expect(isApprovedTenant(NORTHWIND, '')).toBe(false);
  });

  it('refuses a missing or malformed tid, with no fallback tenant', () => {
    for (const tid of [undefined, null, '', '   ', 'organizations', 'common', `${FABRIKAM}x`]) {
      expect(isApprovedTenant(tid, FABRIKAM)).toBe(false);
    }
    expect(normaliseTenantId(42)).toBeUndefined();
  });

  it('skips malformed entries rather than guessing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect([...parseApprovedTenantIds(`${FABRIKAM},,not-a-guid,*`)]).toEqual([FABRIKAM]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(isApprovedTenant('*', '*')).toBe(false);
    warn.mockRestore();
  });
});
