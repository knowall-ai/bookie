import { describe, expect, it } from 'vitest';
import type { AccessSettings } from '@/lib/config/types';
import { DEFAULT_SETTINGS } from '@/lib/config/types';
import {
  accessEntryFor,
  assertCanManageSettings,
  canManageSettings,
  filterOrgsByAccess,
  removeAccessPerson,
  SettingsAccessError,
  upsertAccessPerson,
  type AccessSubject,
} from './access';

const ORGS = [
  { key: 'xero.c1.t-uk', name: 'Northwind Ltd' },
  { key: 'xero.c1.t-sv', name: 'Northwind SA de CV' },
  { key: 'bc.Production.co-1', name: 'Northwind (BC)' },
];

const guest: AccessSubject = { email: 'Accountant@Fabrikam.example', userType: 'Guest' };
const member: AccessSubject = { email: 'alex@northwind.example', userType: 'Member' };

const access = (people: AccessSettings['people'], membersSeeAll = true): AccessSettings => ({
  people,
  membersSeeAll,
});

const keys = (orgs: { key: string }[]) => orgs.map((o) => o.key);

describe('organisation access', () => {
  it('matches the access entry by email, case-insensitively and ignoring spaces', () => {
    const settings = access([
      { email: ' accountant@fabrikam.EXAMPLE ', orgKeys: ['xero.c1.t-uk'] },
    ]);
    expect(accessEntryFor(settings, guest.email)?.orgKeys).toEqual(['xero.c1.t-uk']);
    expect(keys(filterOrgsByAccess(ORGS, guest, settings))).toEqual(['xero.c1.t-uk']);
  });

  it('shows a guest with no entry nothing at all', () => {
    expect(filterOrgsByAccess(ORGS, guest, DEFAULT_SETTINGS.access)).toEqual([]);
    expect(filterOrgsByAccess(ORGS, guest, undefined)).toEqual([]);
    const someoneElse = access([{ email: 'other@fabrikam.example', orgKeys: 'all' }]);
    expect(filterOrgsByAccess(ORGS, guest, someoneElse)).toEqual([]);
  });

  it('never matches an empty email to an entry', () => {
    const settings = access([{ email: '', orgKeys: 'all' }]);
    expect(filterOrgsByAccess(ORGS, { email: '', userType: 'Guest' }, settings)).toEqual([]);
  });

  it('gives a guest with orgKeys "all" every organisation', () => {
    const settings = access([{ email: guest.email, orgKeys: 'all' }]);
    expect(keys(filterOrgsByAccess(ORGS, guest, settings))).toEqual(keys(ORGS));
  });

  it('ignores granted keys for organisations that no longer exist', () => {
    const settings = access([{ email: guest.email, orgKeys: ['xero.gone.gone', 'xero.c1.t-uk'] }]);
    expect(keys(filterOrgsByAccess(ORGS, guest, settings))).toEqual(['xero.c1.t-uk']);
  });

  it('leaves members unaffected by default, even when they have an entry', () => {
    expect(filterOrgsByAccess(ORGS, member, DEFAULT_SETTINGS.access)).toEqual(ORGS);
    const settings = access([{ email: member.email, orgKeys: ['xero.c1.t-uk'] }]);
    expect(filterOrgsByAccess(ORGS, member, settings)).toEqual(ORGS);
  });

  it('limits members to their entry when "everyone can see all" is off', () => {
    const settings = access([{ email: member.email, orgKeys: ['bc.Production.co-1'] }], false);
    expect(keys(filterOrgsByAccess(ORGS, member, settings))).toEqual(['bc.Production.co-1']);
    const noEntry = access([], false);
    expect(filterOrgsByAccess(ORGS, member, noEntry)).toEqual([]);
  });

  it('treats an unknown user type as a guest (fail closed)', () => {
    const unknown = { email: member.email, userType: 'Other' } as unknown as AccessSubject;
    expect(filterOrgsByAccess(ORGS, unknown, DEFAULT_SETTINGS.access)).toEqual([]);
  });

  it('lets only members manage settings', () => {
    expect(canManageSettings(member)).toBe(true);
    expect(canManageSettings(guest)).toBe(false);
    expect(() => assertCanManageSettings(guest)).toThrow(SettingsAccessError);
    expect(() => assertCanManageSettings(member)).not.toThrow();
  });

  it('adds, replaces in place and removes people by email, case-insensitively', () => {
    let settings = access([{ email: 'a@example.com', orgKeys: [] }]);
    settings = upsertAccessPerson(settings, {
      email: 'b@example.com',
      name: ' Bea ',
      orgKeys: ['x'],
    });
    settings = upsertAccessPerson(settings, { email: 'A@EXAMPLE.com', orgKeys: 'all' });
    expect(settings.people).toEqual([
      { email: 'A@EXAMPLE.com', orgKeys: 'all' },
      { email: 'b@example.com', name: 'Bea', orgKeys: ['x'] },
    ]);
    expect(removeAccessPerson(settings, 'B@example.COM').people).toHaveLength(1);
  });
});
