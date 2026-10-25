import { DEMO_GUEST, DEMO_MEMBER } from '@/lib/auth/dev';
import type { DirectoryPerson, SignInStatus } from './types';

/**
 * The demo tenant's fictional directory (BOOKIE_DEV_AUTH=demo): Contoso
 * people and one guest accountant from Fabrikam. Never real people.
 */
export const DEMO_DIRECTORY: DirectoryPerson[] = [
  { id: DEMO_MEMBER.id, name: DEMO_MEMBER.name, email: DEMO_MEMBER.email, userType: 'Member' },
  {
    id: '00000000-0000-0000-0000-00000000d303',
    name: 'Priya Shah',
    email: 'priya.shah@contoso.example',
    userType: 'Member',
  },
  {
    id: '00000000-0000-0000-0000-00000000d304',
    name: 'Sam Taylor',
    email: 'sam.taylor@contoso.example',
    userType: 'Member',
  },
  {
    id: '00000000-0000-0000-0000-00000000d305',
    name: 'Chris Doyle',
    email: 'chris.doyle@contoso.example',
    userType: 'Member',
  },
  {
    id: '00000000-0000-0000-0000-00000000d306',
    name: 'Morgan Blake',
    email: 'morgan.blake@contoso.example',
    userType: 'Member',
  },
  {
    // A shared mailbox: they're in the directory too, so Settings › Email can find them.
    id: '00000000-0000-0000-0000-00000000d307',
    name: 'Contoso Payables',
    email: 'payables@contoso.example',
    userType: 'Member',
  },
  { id: DEMO_GUEST.id, name: DEMO_GUEST.name, email: DEMO_GUEST.email, userType: 'Guest' },
];

/** In the demo, Sam Taylor isn't assigned to Bookie yet, so the sign-in hint can be seen. */
const DEMO_NOT_ASSIGNED = new Set(['00000000-0000-0000-0000-00000000d304']);

/** Like Graph `$search` on displayName and mail: a word (or the whole value) starts with the query. */
export function matchesDirectoryQuery(person: DirectoryPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [person.name, person.email].some((value) => {
    const v = value.toLowerCase();
    return v.startsWith(q) || v.split(/[^a-z0-9]+/).some((word) => word.startsWith(q));
  });
}

export function searchDemoDirectory(query: string, top = 10): DirectoryPerson[] {
  return DEMO_DIRECTORY.filter((p) => matchesDirectoryQuery(p, query)).slice(0, top);
}

export function demoSignInStatuses(userIds: string[]): Record<string, SignInStatus> {
  const result: Record<string, SignInStatus> = {};
  for (const id of userIds) {
    if (DEMO_DIRECTORY.some((p) => p.id === id))
      result[id] = DEMO_NOT_ASSIGNED.has(id) ? 'not-assigned' : 'ok';
  }
  return result;
}
