import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/auth/context';
import { DEMO_GUEST, DEMO_MEMBER } from '@/lib/auth/dev';
import { SettingsAccessError } from '@/lib/auth/access';
import { configStoreFor } from '@/lib/config';
import type { BitcoinWalletsModule, SourceBitcoinWallets } from '@/lib/connectors/types';
import { addWalletSchema } from '@/lib/portal/actions/bitcoin-schema';
import { DEMO_WALLET_ID, DEMO_WALLET_ZPUB, DEMO_WALLET_ORG } from './demo';
import { parseWalletInput, scriptDeriver } from './descriptor';
import {
  NO_ELECTRUM,
  PENDING_VALUE_REASON,
  addWallet,
  electrumSetting,
  electrumSettingFor,
  electrumStatusFor,
  cacheKey,
  electrumStatus,
  listWallets,
  loadWallet,
  receiveAddress,
  removeWallet,
  baseCurrencyOf,
  valueBalance,
  valueTransactions,
  walletsForOrg,
  type WalletScope,
} from './wallets';
import { WalletError } from './errors';

// The public BIP84 test vector account key: not anyone's wallet.
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const BANK_ID = '11111111-2222-3333-4444-555555555555';

const demo = (user = DEMO_MEMBER): AuthContext => ({
  mode: 'demo',
  user,
  getToken: async () => {
    throw new Error('no tokens');
  },
});

const demoScope = (key: string): WalletScope => ({ org: { key, kind: 'demo' } });

function bcScope(result: SourceBitcoinWallets): WalletScope & { calls: () => number } {
  const wallets = vi.fn(async () => result);
  const bitcoin: BitcoinWalletsModule = { wallets };
  return {
    org: { key: 'bc.Sandbox.cronus', kind: 'business-central' },
    connector: { bitcoin },
    calls: () => wallets.mock.calls.length,
  };
}

afterEach(async () => {
  const store = configStoreFor(demo());
  for (const w of await store.listWallets()) await store.deleteWallet(w.id);
  const settings = await store.getSettings();
  delete settings.bitcoin;
  await store.saveSettings(settings);
  delete process.env.BOOKIE_ELECTRUM_URL;
});

describe('sealed wallet records (organisations whose books cannot hold a descriptor)', () => {
  it('seals the descriptor in the tenant store and never returns it in summaries', async () => {
    const auth = demo();
    const added = await addWallet(auth, {
      name: 'Cold storage',
      orgKey: DEMO_WALLET_ORG,
      key: ZPUB,
    });
    expect(added.typeLabel).toBe('Native SegWit (P2WPKH)');
    expect(added.source).toBe('bookie');
    expect(JSON.stringify(added)).not.toMatch(/[xz]pub/);

    const [record] = await configStoreFor(auth).listWallets();
    expect(record.descriptor).toMatch(/^wpkh\(xpub/);

    const listed = await listWallets(auth);
    expect(listed.map((w) => w.name)).toEqual(['Contoso Treasury', 'Cold storage']);
    expect(JSON.stringify(listed)).not.toMatch(/[xz]pub/);
  });

  it('shows wallets only in their own organisation', async () => {
    const auth = demo();
    await addWallet(auth, { name: 'Wholesale', orgKey: 'demo.contoso-wholesale', key: ZPUB });
    const wholesale = await walletsForOrg(auth, demoScope('demo.contoso-wholesale'));
    expect(wholesale.wallets.map((w) => w.name)).toEqual(['Wholesale']);
    const contoso = await walletsForOrg(auth, demoScope(DEMO_WALLET_ORG));
    expect(contoso.wallets.map((w) => w.id)).toEqual([DEMO_WALLET_ID]);
  });

  it('refuses guests', async () => {
    await expect(
      addWallet(demo(DEMO_GUEST), { name: 'x', orgKey: DEMO_WALLET_ORG, key: ZPUB })
    ).rejects.toBeInstanceOf(SettingsAccessError);
    await expect(listWallets(demo(DEMO_GUEST))).rejects.toBeInstanceOf(SettingsAccessError);
    await expect(
      removeWallet(demo(DEMO_GUEST), '00000000-0000-0000-0000-000000000000')
    ).rejects.toBeInstanceOf(SettingsAccessError);
  });

  it('refuses organisations the member cannot open', async () => {
    await expect(
      addWallet(demo(), { name: 'x', orgKey: 'bc.Production.someone-else', key: ZPUB })
    ).rejects.toThrow(/Organisation not found/);
  });

  it('refuses the same wallet twice', async () => {
    const auth = demo();
    await addWallet(auth, { name: 'One', orgKey: DEMO_WALLET_ORG, key: ZPUB });
    await expect(
      addWallet(auth, { name: 'Two', orgKey: DEMO_WALLET_ORG, key: ZPUB })
    ).rejects.toThrow(/already/);
  });

  it('removes a wallet', async () => {
    const auth = demo();
    const added = await addWallet(auth, { name: 'Gone', orgKey: DEMO_WALLET_ORG, key: ZPUB });
    await removeWallet(auth, added.id);
    expect(await configStoreFor(auth).listWallets()).toEqual([]);
  });

  it("doesn't find another organisation's wallet by id", async () => {
    const auth = demo();
    const added = await addWallet(auth, { name: 'Here', orgKey: DEMO_WALLET_ORG, key: ZPUB });
    await expect(
      loadWallet(auth, demoScope('demo.contoso-wholesale'), added.id)
    ).rejects.toBeInstanceOf(WalletError);
  });
});

describe('Business Central wallets (on the BC bank account)', () => {
  it('lists bank accounts with a descriptor, without returning the descriptor', async () => {
    const scope = bcScope({
      status: 'ok',
      wallets: [
        {
          bankAccountId: BANK_ID,
          bankAccountNumber: 'BTC-01',
          name: 'Treasury',
          currencyCode: 'BTC',
          descriptor: ZPUB,
        },
      ],
    });
    const { wallets, unavailable } = await walletsForOrg(demo(), scope);
    expect(unavailable).toBeUndefined();
    expect(wallets).toEqual([
      expect.objectContaining({
        id: `bc~${BANK_ID}`,
        name: 'Treasury',
        source: 'business-central',
        bcBankAccountNumber: 'BTC-01',
        typeLabel: 'Native SegWit (P2WPKH)',
        currencyCode: 'BTC',
      }),
    ]);
    expect(JSON.stringify(wallets)).not.toMatch(/[xz]pub/);
  });

  it('passes the BC script type for a bare xpub', async () => {
    const xpub =
      'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V';
    const scope = bcScope({
      status: 'ok',
      wallets: [
        {
          bankAccountId: BANK_ID,
          bankAccountNumber: 'BTC-01',
          name: 'Treasury',
          currencyCode: 'BTC',
          descriptor: xpub,
          scriptType: 'tr',
        },
      ],
    });
    const [wallet] = (await walletsForOrg(demo(), scope)).wallets;
    expect(wallet.typeLabel).toBe('Taproot (P2TR)');
  });

  it('turns an unusable descriptor into a problem instead of failing the page', async () => {
    const scope = bcScope({
      status: 'ok',
      wallets: [
        {
          bankAccountId: BANK_ID,
          bankAccountNumber: 'BTC-02',
          name: 'Typo',
          currencyCode: 'BTC',
          descriptor: 'xpub-not-really',
        },
      ],
    });
    const [wallet] = (await walletsForOrg(demo(), scope)).wallets;
    expect(wallet.problem).toMatch(/bank account BTC-02 in Business Central can't be used/);
    const { load } = await loadWallet(demo(), scope, wallet.id);
    expect(load.status).toBe('error');
  });

  it('says when the extension is not installed', async () => {
    const scope = bcScope({ status: 'unavailable', reason: 'Not installed.' });
    expect(await walletsForOrg(demo(), scope)).toEqual({
      wallets: [],
      unavailable: 'Not installed.',
    });
  });

  it('asks Business Central once per connector', async () => {
    const scope = bcScope({
      status: 'ok',
      wallets: [
        {
          bankAccountId: BANK_ID,
          bankAccountNumber: 'BTC-01',
          name: 'Treasury',
          currencyCode: 'BTC',
          descriptor: ZPUB,
        },
      ],
    });
    await walletsForOrg(demo(), scope);
    await loadWallet(demo(), scope, `bc~${BANK_ID}`);
    expect(scope.calls()).toBe(1);
  });

  it('only resolves BC wallet ids in a BC organisation', async () => {
    const scope = bcScope({ status: 'ok', wallets: [] });
    await expect(loadWallet(demo(), scope, `bc~${BANK_ID}`)).rejects.toThrow(/not found/);
    await expect(loadWallet(demo(), scope, DEMO_WALLET_ID)).rejects.toThrow(/not found/);
  });
});

describe('Electrum configuration', () => {
  it('says there is no server when BOOKIE_ELECTRUM_URL is unset, and shows nothing', async () => {
    const auth = demo();
    const added = await addWallet(auth, { name: 'Live', orgKey: DEMO_WALLET_ORG, key: ZPUB });
    const { load } = await loadWallet(auth, demoScope(DEMO_WALLET_ORG), added.id);
    expect(load).toEqual({ status: 'not-configured', message: NO_ELECTRUM });
  });

  it('reads the server, the trust flag and a certificate pin', () => {
    expect(
      electrumSetting({ BOOKIE_ELECTRUM_URL: 'ssl://electrum.example.com:50002' })
    ).toMatchObject({
      configured: true,
      trusted: false,
    });
    expect(
      electrumStatus({
        BOOKIE_ELECTRUM_URL: 'tcp://electrum.example.com:50001',
        BOOKIE_ELECTRUM_TRUSTED: '1',
      })
    ).toEqual({ configured: true, privacyWarning: false, plaintext: true });
    expect(electrumSetting({ BOOKIE_ELECTRUM_URL: 'https://x' })).toMatchObject({
      configured: false,
    });
    expect(
      electrumSetting({ BOOKIE_ELECTRUM_URL: 'ssl://h:1', BOOKIE_ELECTRUM_CERT_SHA256: 'nope' })
    ).toMatchObject({ configured: false });
  });
});

describe('demo wallet', () => {
  it('uses fictional fixtures and labels its prices as fictional', async () => {
    const { wallet, load } = await loadWallet(demo(), demoScope(DEMO_WALLET_ORG), DEMO_WALLET_ID);
    expect(wallet.demo).toBe(true);
    if (load.status !== 'ok') throw new Error('expected the demo wallet to load');
    expect(load.source).toBe('demo');
    const rows = await valueTransactions(load.scan.transactions, 'demo', 'GBP');
    const pending = rows.find((r) => r.pending)!;
    expect(pending.value).toEqual({ ok: false, reason: PENDING_VALUE_REASON });
    const priced = rows.find((r) => !r.pending)!;
    expect(priced.value.ok && priced.value.rate.label).toMatch(/^Demo price \(fictional\)/);
  });
});

describe('receiveAddress', () => {
  it('derives the demo wallet’s next receive address from its (public test) key', async () => {
    const receive = await receiveAddress(demo(), demoScope(DEMO_WALLET_ORG), DEMO_WALLET_ID);
    // The demo fixtures use receive 0..3, so the next one is 4.
    const expected = scriptDeriver(parseWalletInput(DEMO_WALLET_ZPUB))('receive', 4).address;
    expect(receive).toEqual({
      ok: true,
      address: expected,
      index: 4,
      network: 'mainnet',
      demo: true,
    });
  });

  it('gives the reason, never a guessed address, when the chain can’t be read', async () => {
    const auth = demo();
    const added = await addWallet(auth, { name: 'Cold', orgKey: DEMO_WALLET_ORG, key: ZPUB });
    const receive = await receiveAddress(auth, demoScope(DEMO_WALLET_ORG), added.id);
    expect(receive).toEqual({
      ok: false,
      reason: `Can’t pick an unused address without reading the chain: ${NO_ELECTRUM}`,
      network: 'mainnet',
    });
  });

  it('doesn’t find another organisation’s wallet', async () => {
    await expect(
      receiveAddress(demo(), demoScope('demo.contoso-wholesale'), DEMO_WALLET_ID)
    ).rejects.toThrow('Wallet not found.');
  });
});

describe('values in the base currency', () => {
  it('reads the base currency from the books, and leaves it undefined when they do not say', async () => {
    expect(await baseCurrencyOf({ organisation: async () => ({ baseCurrency: 'usd' }) })).toBe(
      'USD'
    );
    expect(await baseCurrencyOf({ organisation: async () => ({}) })).toBeUndefined();
    expect(
      await baseCurrencyOf({
        organisation: async () => {
          throw new Error('down');
        },
      })
    ).toBeUndefined();
  });

  it('gives no value when the base currency is unknown or not quoted', async () => {
    expect(await valueBalance(100_000, 'electrum', undefined)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/base currency isn't available/),
    });
    expect(await valueBalance(100_000, 'electrum', 'X1')).toMatchObject({ ok: false });
  });

  it('never prices the demo (GBP) in another currency', async () => {
    const { load } = await loadWallet(demo(), demoScope(DEMO_WALLET_ORG), DEMO_WALLET_ID);
    if (load.status !== 'ok') throw new Error('expected the demo wallet to load');
    const rows = await valueTransactions(load.scan.transactions, 'demo', 'USD');
    expect(rows.every((r) => !r.value.ok)).toBe(true);
    expect(await valueBalance(1, 'demo', 'USD')).toMatchObject({ ok: false });
  });
});

describe('addWalletSchema', () => {
  it('validates names, org keys and keys', () => {
    expect(
      addWalletSchema.parse({ name: ' Cold ', orgKey: 'demo.contoso', key: ZPUB })
    ).toMatchObject({
      name: 'Cold',
    });
    expect(() => addWalletSchema.parse({ name: '', orgKey: 'demo.contoso', key: ZPUB })).toThrow();
    expect(() => addWalletSchema.parse({ name: 'x', orgKey: '../etc', key: ZPUB })).toThrow();
    expect(() =>
      addWalletSchema.parse({ name: 'x', orgKey: 'demo.contoso', key: 'short' })
    ).toThrow();
    expect(() =>
      addWalletSchema.parse({
        name: 'x',
        orgKey: 'demo.contoso',
        key: ZPUB,
        scriptType: 'wsh-multi',
      })
    ).toThrow();
  });
});

describe('effective Electrum server', () => {
  it('uses the installation by default and the sealed tenant override when set', async () => {
    process.env.BOOKIE_ELECTRUM_URL = 'tcp://installation.example.com:50001';
    expect(await electrumSettingFor(demo())).toMatchObject({
      source: 'installation',
      server: { host: 'installation.example.com' },
    });
    expect(await electrumStatusFor(demo())).not.toHaveProperty(
      'url',
      'tcp://installation.example.com:50001'
    );
    const store = configStoreFor(demo());
    await store.saveSettings({
      ...(await store.getSettings()),
      bitcoin: { electrum: { url: 'ssl://electrum.example.com:50002', trusted: true } },
    });
    expect(await electrumSettingFor(demo())).toMatchObject({
      source: 'organisation',
      trusted: true,
      server: { guarded: true, host: 'electrum.example.com' },
    });
    expect(await electrumStatusFor(demo())).toMatchObject({
      source: 'organisation',
      privacyWarning: false,
      url: 'ssl://electrum.example.com:50002',
    });
    const other = demo({ ...DEMO_MEMBER, tenantId: 'fictional-other-tenant' });
    expect(await electrumSettingFor(other)).toMatchObject({ source: 'installation' });
  });
  it('separates cached scans by server, protocol, port and tenant', () => {
    const descriptor = parseWalletInput(ZPUB);
    const server = { protocol: 'ssl' as const, host: 'electrum.example.com', port: 50002 };
    const key = cacheKey(demo(), 'demo.contoso', 'wallet', descriptor, server);
    for (const change of [
      { host: 'other.example.com' },
      { protocol: 'tcp' as const },
      { port: 50003 },
    ]) {
      expect(
        cacheKey(demo(), 'demo.contoso', 'wallet', descriptor, { ...server, ...change })
      ).not.toBe(key);
    }
    expect(
      cacheKey(
        demo({ ...DEMO_MEMBER, tenantId: 'fictional-other-tenant' }),
        'demo.contoso',
        'wallet',
        descriptor,
        server
      )
    ).not.toBe(key);
  });
});
