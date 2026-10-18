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
  /** Entra object id of the signed-in user. */
  id?: string;
  email: string;
  userType: UserType;
}

/** Who an access entry is for: an Entra object id and/or an email. */
export interface AccessIdentity {
  userId?: string;
  email: string;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Index of the entry for this identity, or -1.
 *
 * An entry with a `userId` matches only that Entra object id, so an address
 * reused by a different account never inherits someone else's access. An
 * entry without one (saved before the directory picker) matches by email,
 * case-insensitively. An empty email never matches.
 */
export function accessEntryIndex(access: AccessSettings | undefined, who: AccessIdentity): number {
  const people = access?.people ?? [];
  const userId = who.userId?.trim();
  if (userId) {
    const byId = people.findIndex((p) => p.userId === userId);
    if (byId !== -1) return byId;
  }
  const email = normaliseEmail(who.email);
  if (!email) return -1;
  return people.findIndex(
    (p) => normaliseEmail(p.email) === email && (!p.userId || p.userId === userId)
  );
}

/** The access entry for this user: by Entra object id first, then by email. */
export function accessEntryFor(
  access: AccessSettings | undefined,
  user: { id?: string; email: string }
): AccessPerson | undefined {
  const index = accessEntryIndex(access, { userId: user.id, email: user.email });
  return index === -1 ? undefined : access?.people[index];
}

/** The org keys this user may open: `'all'`, or an explicit set (possibly empty). */
export function allowedOrgKeys(
  user: AccessSubject,
  access: AccessSettings | undefined
): 'all' | Set<string> {
  // Unknown user types are treated as guests: fail closed.
  const member = user.userType === 'Member';
  if (member && (access?.membersSeeAll ?? true)) return 'all';
  const entry = accessEntryFor(access, user);
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

/** A people-and-access change that can't be made, with a message that is safe to show. */
export class AccessChangeError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'AccessChangeError';
  }
}

/** Throws unless the user may change settings. Called by every settings write. */
export function assertCanManageSettings(user: { userType: UserType }): void {
  if (!canManageSettings(user)) throw new SettingsAccessError();
}

/**
 * Insert or replace a person's entry, matched like `accessEntryFor`. Saving
 * with a `userId` links an email-only entry for the same address, so older
 * entries become linked to the directory once they're picked. Saving without
 * one never replaces an entry that is linked to an account.
 */
export function upsertAccessPerson(access: AccessSettings, person: AccessPerson): AccessSettings {
  const email = person.email.trim();
  const userId = person.userId?.trim();
  const index = accessEntryIndex(access, { userId, email });
  const entry: AccessPerson = { ...(userId ? { userId } : {}), email, orgKeys: person.orgKeys };
  if (person.name?.trim()) entry.name = person.name.trim();
  const people = [...access.people];
  if (index === -1) people.push(entry);
  else people[index] = entry;
  return { ...access, people };
}

/** Remove the entry for this identity (matched like `accessEntryFor`), if there is one. */
export function removeAccessPerson(access: AccessSettings, who: AccessIdentity): AccessSettings {
  const index = accessEntryIndex(access, who);
  if (index === -1) return access;
  return { ...access, people: access.people.filter((_, i) => i !== index) };
}
