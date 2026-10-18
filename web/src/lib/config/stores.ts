import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { open, seal } from './crypto';
import { DEFAULT_SETTINGS, type ConfigStore, type Connection, type TenantSettings } from './types';

const SETTINGS_RECORD = 'settings';
const connectionRecord = (id: string) => `connection:${id}`;

/** Shared logic: every store is a set of named, sealed records for one tenant. */
abstract class SealedRecordStore implements ConfigStore {
  abstract readonly location: string;
  constructor(
    protected readonly tenantId: string,
    /** Settings used until the tenant saves its own (the demo store seeds an access entry). */
    protected readonly defaults: TenantSettings = DEFAULT_SETTINGS
  ) {}

  protected abstract readAll(): Promise<Map<string, string>>;
  protected abstract write(name: string, sealed: string): Promise<void>;
  protected abstract remove(name: string): Promise<void>;

  /** Local and in-memory stores have nothing to open in a browser. */
  async locationUrl(): Promise<string | undefined> {
    return undefined;
  }

  async listConnections(): Promise<Connection[]> {
    const records = await this.readAll();
    const connections: Connection[] = [];
    for (const [name, sealed] of records) {
      if (!name.startsWith('connection:')) continue;
      connections.push(open<Connection>(this.tenantId, name, sealed));
    }
    return connections.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getConnection(id: string): Promise<Connection | undefined> {
    const sealed = (await this.readAll()).get(connectionRecord(id));
    return sealed ? open<Connection>(this.tenantId, connectionRecord(id), sealed) : undefined;
  }

  async saveConnection(connection: Connection): Promise<void> {
    await this.write(
      connectionRecord(connection.id),
      seal(this.tenantId, connectionRecord(connection.id), connection)
    );
  }

  async deleteConnection(id: string): Promise<void> {
    await this.remove(connectionRecord(id));
  }

  async getSettings(): Promise<TenantSettings> {
    const sealed = (await this.readAll()).get(SETTINGS_RECORD);
    if (!sealed) return structuredClone(this.defaults);
    const stored = open<Partial<TenantSettings>>(this.tenantId, SETTINGS_RECORD, sealed);
    return {
      xero: { ...DEFAULT_SETTINGS.xero, ...stored.xero },
      businessCentral: { ...DEFAULT_SETTINGS.businessCentral, ...stored.businessCentral },
      access: {
        ...DEFAULT_SETTINGS.access,
        ...stored.access,
        people: Array.isArray(stored.access?.people) ? stored.access.people : [],
      },
      forecast: stored.forecast,
      accountsMailbox:
        typeof stored.accountsMailbox === 'string' && stored.accountsMailbox
          ? stored.accountsMailbox
          : undefined,
    };
  }

  async saveSettings(settings: TenantSettings): Promise<void> {
    await this.write(SETTINGS_RECORD, seal(this.tenantId, SETTINGS_RECORD, settings));
  }
}

/* ------------------------------------------------------------------ */
/* SharePoint: the default. Data stays in the customer's own tenant.   */
/* ------------------------------------------------------------------ */

const LIST_NAME = 'BookieConnections';
const DATA_COLUMN = 'BookieData';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const listLocations = new Map<
  string,
  { siteId: string; listId: string; webUrl?: string; listWebUrl?: string }
>();

interface GraphListItem {
  id: string;
  fields: { Title?: string; [DATA_COLUMN]?: string };
}

/**
 * A hidden list called BookieConnections on the tenant's root SharePoint site,
 * created on first save. Each item is one sealed record. Reached with the
 * signed-in user's delegated Graph token (Sites.Manage.All, admin-consented).
 */
export class SharePointConfigStore extends SealedRecordStore {
  readonly location = 'SharePoint › root site › BookieConnections (hidden list)';

  constructor(
    tenantId: string,
    private readonly graphToken: () => Promise<string>
  ) {
    super(tenantId);
  }

  private async graph<T>(pathAndQuery: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${GRAPH}${pathAndQuery}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.graphToken()}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      cache: 'no-store',
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        (body as { error?: { message?: string } }).error?.message ?? response.statusText;
      throw new Error(`SharePoint config store: ${message}`);
    }
    return body as T;
  }

  /**
   * The BookieConnections list's own SharePoint page, from Graph. `undefined`
   * before the list exists or when Graph can't say: Settings then shows plain text.
   */
  async locationUrl(): Promise<string | undefined> {
    try {
      const location = await this.locate(false);
      if (!location) return undefined;
      if (!location.listWebUrl) {
        const list = await this.graph<{ webUrl?: string }>(
          `/sites/${location.siteId}/lists/${location.listId}?$select=webUrl`
        );
        const url = list.webUrl ? new URL(list.webUrl) : undefined;
        if (url?.protocol !== 'https:') return undefined;
        location.listWebUrl = url.href;
      }
      return location.listWebUrl;
    } catch (error) {
      console.error('[bookie] SharePoint list link unavailable', error);
      return undefined;
    }
  }

  private async locate(
    create: boolean
  ): Promise<{ siteId: string; listId: string; listWebUrl?: string } | null> {
    const known = listLocations.get(this.tenantId);
    if (known) return known;
    const site = await this.graph<{ id: string; webUrl: string }>('/sites/root?$select=id,webUrl');
    const lists = await this.graph<{ value: { id: string; displayName: string }[] }>(
      `/sites/${site.id}/lists?$select=id,displayName&$top=999`
    );
    let list = lists.value.find((l) => l.displayName === LIST_NAME);
    if (!list) {
      if (!create) return null;
      list = await this.graph<{ id: string; displayName: string }>(`/sites/${site.id}/lists`, {
        method: 'POST',
        body: JSON.stringify({
          displayName: LIST_NAME,
          description:
            'Bookie (getbook.ie) connection settings. Values are encrypted. Do not edit.',
          columns: [{ name: DATA_COLUMN, text: { allowMultipleLines: true } }],
          list: { template: 'genericList', hidden: true },
        }),
      });
    }
    const location = { siteId: site.id, listId: list.id, webUrl: site.webUrl };
    listLocations.set(this.tenantId, location);
    return location;
  }

  private async items(create = false): Promise<{ base: string; items: GraphListItem[] } | null> {
    const location = await this.locate(create);
    if (!location) return null;
    const base = `/sites/${location.siteId}/lists/${location.listId}/items`;
    const items: GraphListItem[] = [];
    let next: string | undefined = `${base}?$expand=fields($select=Title,${DATA_COLUMN})&$top=200`;
    while (next) {
      const page: { value: GraphListItem[]; '@odata.nextLink'?: string } = await this.graph(next);
      items.push(...page.value);
      next = page['@odata.nextLink']?.replace(GRAPH, '');
    }
    return { base, items };
  }

  protected async readAll(): Promise<Map<string, string>> {
    const result = await this.items(false);
    const records = new Map<string, string>();
    for (const item of result?.items ?? []) {
      if (item.fields.Title && item.fields[DATA_COLUMN]) {
        records.set(item.fields.Title, item.fields[DATA_COLUMN]);
      }
    }
    return records;
  }

  protected async write(name: string, sealed: string): Promise<void> {
    const result = await this.items(true);
    if (!result) throw new Error('SharePoint config store: list unavailable.');
    const existing = result.items.find((item) => item.fields.Title === name);
    if (existing) {
      await this.graph(`${result.base}/${existing.id}/fields`, {
        method: 'PATCH',
        body: JSON.stringify({ [DATA_COLUMN]: sealed }),
      });
    } else {
      await this.graph(result.base, {
        method: 'POST',
        body: JSON.stringify({ fields: { Title: name, [DATA_COLUMN]: sealed } }),
      });
    }
  }

  protected async remove(name: string): Promise<void> {
    const result = await this.items(false);
    const existing = result?.items.find((item) => item.fields.Title === name);
    if (result && existing) await this.graph(`${result.base}/${existing.id}`, { method: 'DELETE' });
  }
}

/* ------------------------------------------------------------------ */
/* Local file: development and self-hosters without SharePoint.        */
/* ------------------------------------------------------------------ */

export class FileConfigStore extends SealedRecordStore {
  readonly location: string;
  private readonly file: string;

  constructor(tenantId: string, directory = process.env.BOOKIE_CONFIG_DIR ?? '.bookie-config') {
    super(tenantId);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('Invalid tenant id.');
    this.file = path.resolve(directory, `${tenantId}.json`);
    this.location = `Local file ${this.file}`;
  }

  protected async readAll(): Promise<Map<string, string>> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Record<string, string>;
      return new Map(Object.entries(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
      throw error;
    }
  }

  private async persist(records: Map<string, string>) {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.file, JSON.stringify(Object.fromEntries(records), null, 2), {
      mode: 0o600,
    });
  }

  protected async write(name: string, sealed: string) {
    const records = await this.readAll();
    records.set(name, sealed);
    await this.persist(records);
  }

  protected async remove(name: string) {
    const records = await this.readAll();
    records.delete(name);
    await this.persist(records);
  }
}

/* ------------------------------------------------------------------ */
/* Memory: unit tests and demo mode.                                   */
/* ------------------------------------------------------------------ */

const memory = new Map<string, Map<string, string>>();

export class MemoryConfigStore extends SealedRecordStore {
  readonly location = 'In memory (demo)';

  private get records() {
    let records = memory.get(this.tenantId);
    if (!records) memory.set(this.tenantId, (records = new Map()));
    return records;
  }

  protected async readAll() {
    return new Map(this.records);
  }
  protected async write(name: string, sealed: string) {
    this.records.set(name, sealed);
  }
  protected async remove(name: string) {
    this.records.delete(name);
  }
}
