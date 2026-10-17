import type { AccessPerson, AccessSettings } from '@/lib/config/types';

/**
 * Per-person organisation access. Pure functions, so the rules are unit
 * tested on their own; `listOrgs` applies them to every request.
 *
 * - Guests (Entra B2B users, such as an external accountant) see only the
 *   organisations their access entry grants. No entry means no organisations.
 * - Members see every organisation while `membersSeeAll` is on (the default);
 *   otherwise only what their entry grants.
 * - Only members can change settings, so a guest can never grant themselves more.
 */

export type UserType = 'Member' | 'Guest';

export interface AccessSubject {
  email: string;
  userType: UserType;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The access entry for this email (case-insensitive), if any. An empty email never matches. */
export function accessEntryFor(
  access: AccessSettings | undefined,
  email: string
): AccessPerson | undefined {
  const wanted = normaliseEmail(email);
  if (!wanted) return undefined;
  return access?.people.find((p) => normaliseEmail(p.email) === wanted);
}

/** The org keys this user may open: `'all'`, or an explicit set (possibly empty). */
export function allowedOrgKeys(
  user: AccessSubject,
  access: AccessSettings | undefined
): 'all' | Set<string> {
  // Unknown user types are treated as guests: fail closed.
  const member = user.userType === 'Member';
  if (member && (access?.membersSeeAll ?? true)) return 'all';
  const entry = accessEntryFor(access, user.email);
  if (!entry) return new Set();
  return entry.orgKeys === 'all' ? 'all' : new Set(entry.orgKeys);
}

/** Keep only the organisations this user may open. */
export function filterOrgsByAccess<T extends { key: string }>(
  orgs: T[],
  user: AccessSubject,
  access: AccessSettings | undefined
): T[] {
  const allowed = allowedOrgKeys(user, access);
  return allowed === 'all' ? orgs : orgs.filter((o) => allowed.has(o.key));
}

/** Settings (connections, Business Central, people and access) are for members only. */
export function canManageSettings(user: { userType: UserType }): boolean {
  return user.userType === 'Member';
}

export class SettingsAccessError extends Error {
  readonly status = 403;
  constructor(
    message = 'Only members of this organisation can change its settings. Ask one of its administrators.'
  ) {
    super(message);
    this.name = 'SettingsAccessError';
  }
}

/** Throws unless the user may change settings. Called by every settings write. */
export function assertCanManageSettings(user: { userType: UserType }): void {
  if (!canManageSettings(user)) throw new SettingsAccessError();
}

/** Insert or replace a person's entry (matched by email, case-insensitive). */
export function upsertAccessPerson(access: AccessSettings, person: AccessPerson): AccessSettings {
  const email = person.email.trim();
  const entry: AccessPerson = { email, orgKeys: person.orgKeys };
  if (person.name?.trim()) entry.name = person.name.trim();
  const index = access.people.findIndex((p) => normaliseEmail(p.email) === normaliseEmail(email));
  const people = [...access.people];
  if (index === -1) people.push(entry);
  else people[index] = entry;
  return { ...access, people };
}

export function removeAccessPerson(access: AccessSettings, email: string): AccessSettings {
  return {
    ...access,
    people: access.people.filter((p) => normaliseEmail(p.email) !== normaliseEmail(email)),
  };
}
