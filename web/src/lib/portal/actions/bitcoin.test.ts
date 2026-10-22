import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_MEMBER, DEMO_GUEST } from '@/lib/auth/dev';
import type { AuthContext } from '@/lib/auth/context';
import { configStoreFor } from '@/lib/config';
import { ElectrumClient, ElectrumError } from '@/lib/bitcoin/electrum';
import { clearElectrumServerAction, saveElectrumServerAction } from './bitcoin';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth/context', () => ({ requireAuth: mocks.auth }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config')>();
  return {
    ...actual,
    configStoreFor: (auth: AuthContext) => actual.configStoreFor({ ...auth, mode: 'demo' }),
  };
});
const auth: AuthContext = { mode: 'demo', user: DEMO_MEMBER, getToken: async () => 'unused' };
const input = { url: 'ssl://electrum.example.com:50002', trusted: true };

beforeEach(async () => {
  vi.restoreAllMocks();
  mocks.auth.mockResolvedValue(auth);
  mocks.revalidate.mockClear();
  const store = configStoreFor(auth);
  const settings = await store.getSettings();
  delete settings.bitcoin;
  await store.saveSettings(settings);
});

describe('Electrum actions', () => {
  it('saves in demo without network access and clears only the override', async () => {
    const connect = vi.spyOn(ElectrumClient, 'connect');
    const store = configStoreFor(auth);
    const original = await store.getSettings();
    expect(await saveElectrumServerAction(input)).toEqual({ ok: true, data: { url: input.url } });
    expect(connect).not.toHaveBeenCalled();
    expect((await store.getSettings()).bitcoin?.electrum).toEqual(input);
    expect(await clearElectrumServerAction()).toEqual({ ok: true, data: undefined });
    expect((await store.getSettings()).bitcoin?.electrum).toBeUndefined();
    expect((await store.getSettings()).access).toEqual(original.access);
    expect(mocks.revalidate).toHaveBeenCalledWith('/portal', 'layout');
  });
  it('refuses guests for both writes', async () => {
    mocks.auth.mockResolvedValue({ ...auth, user: DEMO_GUEST });
    expect((await saveElectrumServerAction(input)).ok).toBe(false);
    expect((await clearElectrumServerAction()).ok).toBe(false);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('does not connect for invalid input', async () => {
    const connect = vi.spyOn(ElectrumClient, 'connect');
    expect((await saveElectrumServerAction({ ...input, url: 'tcp://x:1' })).ok).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });
  it('keeps the previous setting when the connection test fails', async () => {
    await saveElectrumServerAction(input);
    mocks.auth.mockResolvedValue({ ...auth, mode: 'entra' });
    vi.spyOn(ElectrumClient, 'connect').mockRejectedValue(
      new ElectrumError('The Electrum server refused the connection.')
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await saveElectrumServerAction({ ...input, url: 'ssl://other.example.com:50002' })
    ).toEqual({ ok: false, error: 'The Electrum server refused the connection.' });
    expect((await configStoreFor(auth).getSettings()).bitcoin?.electrum).toEqual(input);
  });
  it('closes the tested client and saves after a successful handshake', async () => {
    mocks.auth.mockResolvedValue({ ...auth, mode: 'entra' });
    const close = vi.fn();
    const connect = vi
      .spyOn(ElectrumClient, 'connect')
      .mockResolvedValue({ close } as unknown as ElectrumClient);
    expect((await saveElectrumServerAction(input)).ok).toBe(true);
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ guarded: true }),
      expect.anything()
    );
    expect(close).toHaveBeenCalledOnce();
    expect((await configStoreFor(auth).getSettings()).bitcoin?.electrum).toEqual(input);
  });
});
