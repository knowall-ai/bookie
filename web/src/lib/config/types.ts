/**
 * What Bookie remembers about a tenant: its connections and settings. Never
 * accounting data. Stored, sealed, in the tenant's own Microsoft 365.
 */

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

export interface TenantSettings {
  xero: { enabled: boolean };
  businessCentral: {
    enabled: boolean;
    /** `environment/companyId` keys the user chose to hide from the org switcher. */
    hiddenCompanies: string[];
    /** "Live updates": Bookie keeps BC webhook subscriptions for the visible companies. */
    liveUpdates?: boolean;
  };
}

export const DEFAULT_SETTINGS: TenantSettings = {
  xero: { enabled: true },
  businessCentral: { enabled: true, hiddenCompanies: [] },
};

export interface ConfigStore {
  /** Where the data lives, shown in Settings so admins can find it. */
  readonly location: string;
  listConnections(): Promise<Connection[]>;
  getConnection(id: string): Promise<Connection | undefined>;
  saveConnection(connection: Connection): Promise<void>;
  deleteConnection(id: string): Promise<void>;
  getSettings(): Promise<TenantSettings>;
  saveSettings(settings: TenantSettings): Promise<void>;
}
