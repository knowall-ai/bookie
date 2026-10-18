import { describe, expect, it } from 'vitest';
import type { AccessSettings } from '@/lib/config/types';
import { DEFAULT_SETTINGS } from '@/lib/config/types';
import {
  accessEntryFor,
  accessEntryIndex,
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
    expect(accessEntryFor(settings, guest)?.orgKeys).toEqual(['xero.c1.t-uk']);
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
    expect(removeAccessPerson(settings, { email: 'B@example.COM' }).people).toHaveLength(1);
  });
});

describe('matching by Entra object id', () => {
  const ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_ID = '22222222-2222-4222-8222-222222222222';
  const linked: AccessSubject = { id: ID, email: guest.email, userType: 'Guest' };

  it('matches an entry by userId first, even when the email differs', () => {
    const settings = access([
      { email: guest.email, orgKeys: ['xero.c1.t-sv'] },
      { userId: ID, email: 'old-address@fabrikam.example', orgKeys: ['xero.c1.t-uk'] },
    ]);
    expect(accessEntryFor(settings, linked)?.orgKeys).toEqual(['xero.c1.t-uk']);
    expect(keys(filterOrgsByAccess(ORGS, linked, settings))).toEqual(['xero.c1.t-uk']);
  });

  it('falls back to email for an entry saved without a userId', () => {
    const settings = access([{ email: guest.email, orgKeys: ['xero.c1.t-sv'] }]);
    expect(accessEntryFor(settings, linked)?.orgKeys).toEqual(['xero.c1.t-sv']);
    expect(keys(filterOrgsByAccess(ORGS, linked, settings))).toEqual(['xero.c1.t-sv']);
  });

  it('never gives an entry linked to one account to another account with the same email', () => {
    const settings = access([{ userId: OTHER_ID, email: guest.email, orgKeys: 'all' }]);
    expect(accessEntryFor(settings, linked)).toBeUndefined();
    expect(filterOrgsByAccess(ORGS, linked, settings)).toEqual([]);
    // Without an id on the subject, a linked entry doesn't match by email either.
    expect(filterOrgsByAccess(ORGS, guest, settings)).toEqual([]);
  });

  it('applies the same rules to members when "everyone can see all" is off', () => {
    const me: AccessSubject = { id: ID, email: member.email, userType: 'Member' };
    const settings = access(
      [{ userId: ID, email: 'renamed@northwind.example', orgKeys: ['bc.Production.co-1'] }],
      false
    );
    expect(keys(filterOrgsByAccess(ORGS, me, settings))).toEqual(['bc.Production.co-1']);
  });

  it('accessEntryIndex finds by id, then by unlinked email, else -1', () => {
    const settings = access([
      { email: 'a@example.com', orgKeys: [] },
      { userId: ID, email: 'b@example.com', orgKeys: [] },
    ]);
    expect(accessEntryIndex(settings, { userId: ID, email: 'x@example.com' })).toBe(1);
    expect(accessEntryIndex(settings, { userId: OTHER_ID, email: 'A@example.com' })).toBe(0);
    expect(accessEntryIndex(settings, { userId: OTHER_ID, email: 'b@example.com' })).toBe(-1);
    expect(accessEntryIndex(settings, { email: '' })).toBe(-1);
    expect(accessEntryIndex(undefined, { userId: ID, email: 'b@example.com' })).toBe(-1);
  });

  it('adds the userId to an email-only entry when it is saved through the picker', () => {
    let settings = access([{ email: 'Robin@Example.com', name: 'Robin', orgKeys: ['x'] }]);
    settings = upsertAccessPerson(settings, {
      userId: ID,
      email: 'robin@example.com',
      name: 'Robin Example',
      orgKeys: ['x'],
    });
    expect(settings.people).toEqual([
      { userId: ID, email: 'robin@example.com', name: 'Robin Example', orgKeys: ['x'] },
    ]);
  });

  it('never replaces a linked entry from an update without a userId', () => {
    let settings = access([{ userId: ID, email: 'robin@example.com', orgKeys: [] }]);
    settings = upsertAccessPerson(settings, { email: 'robin@example.com', orgKeys: 'all' });
    expect(settings.people[0]).toEqual({ userId: ID, email: 'robin@example.com', orgKeys: [] });
  });

  it('adds a second entry for a different account that shares an email', () => {
    let settings = access([{ userId: ID, email: 'robin@example.com', orgKeys: [] }]);
    settings = upsertAccessPerson(settings, {
      userId: OTHER_ID,
      email: 'robin@example.com',
      orgKeys: [],
    });
    expect(settings.people.map((p) => p.userId)).toEqual([ID, OTHER_ID]);
  });

  it('removes by userId, leaving entries for other accounts alone', () => {
    const settings = access([
      { userId: ID, email: 'robin@example.com', orgKeys: [] },
      { userId: OTHER_ID, email: 'robin@example.com', orgKeys: [] },
      { email: 'legacy@example.com', orgKeys: [] },
    ]);
    expect(
      removeAccessPerson(settings, { userId: OTHER_ID, email: 'robin@example.com' }).people
    ).toEqual([settings.people[0], settings.people[2]]);
    expect(removeAccessPerson(settings, { email: 'legacy@example.com' }).people).toHaveLength(2);
    expect(removeAccessPerson(settings, { email: 'nobody@example.com' })).toBe(settings);
  });
});
