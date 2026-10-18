import type { UserType } from '@/lib/auth/access';

/** Someone in the tenant's Microsoft Entra directory, as the people picker shows them. */
export interface DirectoryPerson {
  /** Entra object id. */
  id: string;
  name: string;
  /** Their `mail`, or the address derived from their user principal name. */
  email: string;
  userType: UserType;
}

/**
 * Whether a listed person can sign in to Bookie as far as app assignment goes:
 * `ok` (assigned, directly or through a group, or assignment isn't required)
 * or `not-assigned`. Missing from a result means Bookie couldn't tell.
 */
export type SignInStatus = 'ok' | 'not-assigned';

/** Entra object ids are GUIDs. */
export const ENTRA_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where an administrator assigns people to Bookie: Entra admin centre, Enterprise applications. */
export const ENTRA_ENTERPRISE_APPS_URL =
  'https://entra.microsoft.com/#view/Microsoft_AAD_IAM/StartboardApplicationsMenuBlade/~/AppAppsPreview';

/** A directory lookup that failed, with a message that is safe to show. */
export class DirectoryError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
    this.name = 'DirectoryError';
  }
}
