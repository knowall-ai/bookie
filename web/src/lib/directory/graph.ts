import 'server-only';
import type { AuthContext } from '@/lib/auth/context';
import { externalUpnToEmail, resolveUserType } from '@/lib/auth/options';
import { ReauthRequiredError } from '@/lib/auth/tokens';
import { demoSignInStatuses, DEMO_DIRECTORY, searchDemoDirectory } from './demo';
import { DirectoryError, ENTRA_ID, type DirectoryPerson, type SignInStatus } from './types';

/**
 * Microsoft Entra directory lookups for Settings › People and access, made
 * with the signed-in member's own delegated Graph token (`getToken('graph')`,
 * which carries every Graph permission the tenant consented to Bookie).
 *
 * - Searching people needs `User.ReadBasic.All`.
 * - The app-assignment hint needs `Application.Read.All` (and, for people
 *   assigned through a group, `GroupMember.Read.All`). Without them, or when
 *   Graph errors, the hint is left out rather than guessed.
 *
 * Bookie only reads. It never assigns anyone to the app.
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const TIMEOUT_MS = 8_000;
const USER_SELECT = 'id,displayName,mail,userPrincipalName,userType';

interface GraphUser {
  id?: string | null;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  userType?: string | null;
}

/**
 * A Graph user as the picker shows them, or `undefined` without an id or address.
 * The email is `mail`, else derived from the UPN (a guest's `#EXT#` UPN gives
 * their home address). Member/Guest follows the sign-in rule (`resolveUserType`):
 * a blank `userType` with a non-`#EXT#` UPN is a member.
 */
export function toDirectoryPerson(user: GraphUser): DirectoryPerson | undefined {
  if (!user.id || !ENTRA_ID.test(user.id)) return undefined;
  const email = (
    user.mail || (user.userPrincipalName ? externalUpnToEmail(user.userPrincipalName) : '')
  ).trim();
  if (!email) return undefined;
  return {
    id: user.id,
    name: user.displayName?.trim() || email,
    email,
    userType: resolveUserType({
      userType: user.userType ?? null,
      mail: user.mail ?? null,
      userPrincipalName: user.userPrincipalName ?? null,
    }),
  };
}

/** The Graph `/users` search URL. Quotes and backslashes are dropped so the query can't break out of `$search`. */
export function directorySearchUrl(query: string, top = 10): string {
  const q = query.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
  // encodeURIComponent, not URLSearchParams: Graph wants `%20` for spaces (not `+`) and a literal `$`.
  const search = encodeURIComponent(`"displayName:${q}" OR "mail:${q}"`);
  return `${GRAPH}/users?$search=${search}&$select=${USER_SELECT}&$top=${top}`;
}

/** JSON body of a Graph answer, or `{}` when it isn't JSON. */
async function readJson<T>(response: Response): Promise<Partial<T>> {
  return (await response.json().catch(() => ({}))) as Partial<T>;
}

function reauthError(): DirectoryError {
  return new DirectoryError(
    'Your Microsoft sign-in has expired or isn’t valid any more. Try signing in again.',
    401
  );
}

async function graphToken(auth: AuthContext): Promise<string> {
  try {
    return await auth.getToken('graph');
  } catch (error) {
    if (error instanceof ReauthRequiredError) throw new DirectoryError(error.message, 401);
    console.error('[bookie] no Graph token for the directory', error);
    throw new DirectoryError('Bookie couldn’t reach your Microsoft 365 directory. Try again.');
  }
}

function consentError(): DirectoryError {
  return new DirectoryError(
    'Bookie can’t search your directory yet. A Microsoft 365 administrator needs to approve the “Read all users’ basic profiles” (User.ReadBasic.All) permission for Bookie: see getbook.ie/install.',
    403
  );
}

async function graphFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** Up to `top` people whose name or email matches, members and guests alike. */
export async function searchDirectory(
  auth: AuthContext,
  query: string,
  top = 10
): Promise<DirectoryPerson[]> {
  if (auth.mode === 'demo') return searchDemoDirectory(query, top);
  const token = await graphToken(auth);
  let response: Response;
  try {
    response = await graphFetch(token, directorySearchUrl(query, top), {
      headers: { ConsistencyLevel: 'eventual' },
    });
  } catch (error) {
    console.error('[bookie] directory search failed', error);
    throw new DirectoryError('Microsoft 365 didn’t answer the search. Try again.');
  }
  if (response.status === 401) throw reauthError();
  if (response.status === 403) throw consentError();
  if (!response.ok) {
    console.error('[bookie] directory search failed', response.status);
    throw new DirectoryError('Microsoft 365 didn’t answer the search. Try again.');
  }
  const body = await readJson<{ value: GraphUser[] }>(response);
  return (body.value ?? []).flatMap((u) => toDirectoryPerson(u) ?? []);
}

/** One person by Entra object id, or `undefined` when they aren't in the directory. */
export async function getDirectoryPerson(
  auth: AuthContext,
  id: string
): Promise<DirectoryPerson | undefined> {
  if (!ENTRA_ID.test(id)) return undefined;
  if (auth.mode === 'demo') return DEMO_DIRECTORY.find((p) => p.id === id);
  const token = await graphToken(auth);
  let response: Response;
  try {
    response = await graphFetch(
      token,
      `${GRAPH}/users/${encodeURIComponent(id)}?$select=${USER_SELECT}`
    );
  } catch (error) {
    console.error('[bookie] directory lookup failed', error);
    throw new DirectoryError('Microsoft 365 didn’t answer. Try again.');
  }
  if (response.status === 404) return undefined;
  if (response.status === 401) throw reauthError();
  if (response.status === 403) throw consentError();
  if (!response.ok) {
    console.error('[bookie] directory lookup failed', response.status);
    throw new DirectoryError('Microsoft 365 didn’t answer. Try again.');
  }
  return toDirectoryPerson(await readJson<GraphUser>(response));
}

/* ------------------------------------------------------------------ */
/* App assignment: can this person sign in to Bookie?                  */
/* ------------------------------------------------------------------ */

export interface AppAssignments {
  /** The service principal's `appRoleAssignmentRequired`. */
  required: boolean;
  /** Users assigned directly. */
  users: Set<string>;
  /** Groups assigned (their direct members can sign in). */
  groups: string[];
  /** False when Bookie stopped paging before the end of the list. */
  complete: boolean;
}

/**
 * The status for one person, or `undefined` when it can't be told.
 * `memberOf` is the assigned groups the person belongs to (from
 * `checkMemberGroups`), or `undefined` when that check failed or wasn't made.
 */
export function signInStatusFor(
  userId: string,
  assignments: AppAssignments,
  memberOf?: string[]
): SignInStatus | undefined {
  if (!assignments.required) return 'ok';
  if (assignments.users.has(userId)) return 'ok';
  if (!assignments.complete) return undefined;
  if (assignments.groups.length === 0) return 'not-assigned';
  if (!memberOf) return undefined;
  return memberOf.some((g) => assignments.groups.includes(g)) ? 'ok' : 'not-assigned';
}

const MAX_PAGES = 5;

/** Bookie's service principal in this tenant, and who is assigned to it. `undefined` when Graph won't say. */
async function appAssignments(
  token: string,
  clientId: string
): Promise<AppAssignments | undefined> {
  const sp = await graphFetch(
    token,
    `${GRAPH}/servicePrincipals(appId='${encodeURIComponent(clientId)}')?$select=id,appRoleAssignmentRequired`
  );
  if (!sp.ok) {
    if (sp.status !== 403) console.warn('[bookie] service principal lookup failed', sp.status);
    return undefined;
  }
  const principal = await readJson<{ id: string; appRoleAssignmentRequired: boolean }>(sp);
  if (!principal.id || typeof principal.appRoleAssignmentRequired !== 'boolean') return undefined;
  const result: AppAssignments = {
    required: principal.appRoleAssignmentRequired,
    users: new Set(),
    groups: [],
    complete: true,
  };
  if (!result.required) return result;

  let url: string | undefined =
    `${GRAPH}/servicePrincipals/${encodeURIComponent(principal.id)}/appRoleAssignedTo?$select=principalId,principalType&$top=999`;
  for (let page = 0; url; page++) {
    if (page === MAX_PAGES) {
      result.complete = false;
      break;
    }
    const response = await graphFetch(token, url);
    if (!response.ok) {
      if (response.status !== 403) console.warn('[bookie] app assignments failed', response.status);
      return undefined;
    }
    const body = await readJson<{
      value: { principalId?: string; principalType?: string }[];
      '@odata.nextLink': string;
    }>(response);
    // An answer without a list can't show who is assigned: don't read it as "nobody".
    if (!Array.isArray(body.value)) return undefined;
    for (const a of body.value) {
      if (!a.principalId) continue;
      if (a.principalType === 'User') result.users.add(a.principalId);
      else if (a.principalType === 'Group') result.groups.push(a.principalId);
    }
    url = body['@odata.nextLink'];
  }
  return result;
}

/** Which of `groupIds` the user is in (`checkMemberGroups`, 20 per call), or `undefined` if Graph won't say. */
async function memberGroups(
  token: string,
  userId: string,
  groupIds: string[]
): Promise<string[] | undefined> {
  const found: string[] = [];
  for (let i = 0; i < groupIds.length; i += 20) {
    const response = await graphFetch(
      token,
      `${GRAPH}/users/${encodeURIComponent(userId)}/checkMemberGroups`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: groupIds.slice(i, i + 20) }),
      }
    );
    if (!response.ok) return undefined;
    const body = await readJson<{ value: string[] }>(response);
    if (!Array.isArray(body.value)) return undefined;
    found.push(...body.value);
  }
  return found;
}

/**
 * Sign-in status for each of these people, keyed by Entra object id. People
 * Bookie couldn't check are left out, so the UI shows nothing for them.
 * Never throws.
 */
export async function signInStatuses(
  auth: AuthContext,
  userIds: string[]
): Promise<Record<string, SignInStatus>> {
  const ids = [...new Set(userIds.filter((id) => ENTRA_ID.test(id)))];
  if (ids.length === 0) return {};
  if (auth.mode === 'demo') return demoSignInStatuses(ids);
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  if (!clientId) return {};
  try {
    const token = await auth.getToken('graph');
    const assignments = await appAssignments(token, clientId);
    if (!assignments) return {};
    const entries = await Promise.all(
      ids.map(async (id) => {
        let status = signInStatusFor(id, assignments);
        if (status === undefined && assignments.complete && assignments.groups.length > 0) {
          const groups = await memberGroups(token, id, assignments.groups).catch(() => undefined);
          status = signInStatusFor(id, assignments, groups);
        }
        return [id, status] as const;
      })
    );
    return Object.fromEntries(entries.filter((e): e is [string, SignInStatus] => !!e[1]));
  } catch (error) {
    console.warn('[bookie] app assignment check failed', error);
    return {};
  }
}
