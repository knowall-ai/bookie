/**
 * What Bookie remembers about a tenant: its connections and settings. Never
 * accounting data. Stored, sealed, in the tenant's own Microsoft 365.
 */

import type { PlannedItem } from '@/lib/forecast/types';

export interface XeroCustomConnectionAuth {
  type: 'custom-connection';
  clientId: string;
  clientSecret: string;
}

export interface XeroOAuthAuth {
  type: 'oauth';
  refreshToken: string;
  /** Xero tenant ids the user authorised in this grant. */
  tenantIds: string[];
}

export interface XeroOrgMeta {
  xeroTenantId: string;
  name: string;
  baseCurrency?: string;
  country?: string;
  /** Xero org short code, used for "Open in Xero" deep links. */
  shortCode?: string;
}

export interface XeroConnection {
  id: string;
  kind: 'xero';
  label: string;
  auth: XeroCustomConnectionAuth | XeroOAuthAuth;
  orgs: XeroOrgMeta[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type Connection = XeroConnection;

/**
 * One person's organisation access. Matched by `userId` (their Entra object id)
 * when the entry has one, otherwise by email (case-insensitive). Entries added
 * before the directory picker have no `userId` and keep matching by email.
 */
export interface AccessPerson {
  /** Entra object id from the directory picker. Optional for entries saved before it existed. */
  userId?: string;
  email: string;
  name?: string;
  /** Org keys this person may open, or `'all'` for every organisation (including ones added later). */
  orgKeys: string[] | 'all';
}

/**
 * Who can see which organisations. Guests (Entra B2B, such as an external
 * accountant) see nothing unless they have an entry. Members see everything
 * while `membersSeeAll` is on; otherwise only what their entry grants.
 */
export interface AccessSettings {
  people: AccessPerson[];
  membersSeeAll: boolean;
}

export interface TenantSettings {
  xero: { enabled: boolean };
  businessCentral: {
    enabled: boolean;
    /** `environment/companyId` keys the user chose to hide from the org switcher. */
    hiddenCompanies: string[];
    /** "Live updates": Bookie keeps BC webhook subscriptions for the visible companies. */
    liveUpdates?: boolean;
  };
  access: AccessSettings;
  /**
   * Cash flow forecast assumptions the user typed in, per org key. These are the
   * user's own plans (rent, salaries, a new contract), never accounting data.
   */
  forecast?: Record<string, { planned: PlannedItem[] }>;
}

export const DEFAULT_SETTINGS: TenantSettings = {
  xero: { enabled: true },
  businessCentral: { enabled: true, hiddenCompanies: [] },
  access: { people: [], membersSeeAll: true },
};

export interface ConfigStore {
  /** Where the data lives, shown in Settings so admins can find it. */
  readonly location: string;
  /** A link that opens `location` (the SharePoint list), or `undefined` when there isn't one. */
  locationUrl(): Promise<string | undefined>;
  listConnections(): Promise<Connection[]>;
  getConnection(id: string): Promise<Connection | undefined>;
  saveConnection(connection: Connection): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  getSettings(): Promise<TenantSettings>;
  saveSettings(settings: TenantSettings): Promise<void>;
}
