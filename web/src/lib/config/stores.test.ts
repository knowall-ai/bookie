import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileConfigStore, MemoryConfigStore, SharePointConfigStore } from './stores';

const SITE = 'https://contoso.sharepoint.example';
const LIST_URL = `${SITE}/Lists/BookieConnections`;

/** A fake Graph: the root site, its lists, and the BookieConnections list's webUrl. */
function graph({
  lists = [{ id: 'list-1', displayName: 'BookieConnections' }],
  listWebUrl = LIST_URL as string | null,
  listStatus = 200,
} = {}) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/sites/root'))
      return Response.json({ id: 'site-1', webUrl: SITE }, { status: 200 });
    if (url.endsWith('/lists?$select=id,displayName&$top=999'))
      return Response.json({ value: lists });
    if (url.includes('/lists/list-1?$select=webUrl'))
      return Response.json(
        listStatus === 200 ? { webUrl: listWebUrl } : { error: { message: 'Forbidden' } },
        { status: listStatus }
      );
    return Response.json({ error: { message: `unexpected ${url}` } }, { status: 500 });
  });
}

let n = 0;
/** A fresh fictional tenant per test, since list locations are cached per tenant. */
const tenant = () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`;
const sharePoint = () => new SharePointConfigStore(tenant(), async () => 'graph-token');

describe('config store locationUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('links to the BookieConnections list from Graph, and caches it', async () => {
    const fetchMock = graph();
    vi.stubGlobal('fetch', fetchMock);
    const store = sharePoint();
    await expect(store.locationUrl()).resolves.toBe(LIST_URL);
    const calls = fetchMock.mock.calls.length;
    await expect(store.locationUrl()).resolves.toBe(LIST_URL);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe(
      'https://graph.microsoft.com/v1.0/sites/site-1/lists/list-1?$select=webUrl'
    );
  });

  it('is undefined before the list exists, and never creates it', async () => {
    const fetchMock = graph({ lists: [] });
    vi.stubGlobal('fetch', fetchMock);
    await expect(sharePoint().locationUrl()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it('is undefined when Graph fails or gives no https link', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', graph({ listStatus: 403 }));
    await expect(sharePoint().locationUrl()).resolves.toBeUndefined();

    vi.stubGlobal('fetch', graph({ listWebUrl: null }));
    await expect(sharePoint().locationUrl()).resolves.toBeUndefined();

    vi.stubGlobal('fetch', graph({ listWebUrl: 'javascript:alert(1)' }));
    await expect(sharePoint().locationUrl()).resolves.toBeUndefined();
  });

  it('is undefined for the file and memory stores', async () => {
    await expect(new MemoryConfigStore(tenant()).locationUrl()).resolves.toBeUndefined();
    await expect(new FileConfigStore(tenant(), '/tmp/unused').locationUrl()).resolves.toBe(
      undefined
    );
  });
});
