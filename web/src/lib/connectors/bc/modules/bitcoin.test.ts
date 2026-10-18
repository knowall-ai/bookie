import { describe, expect, it, vi } from 'vitest';
import { ConnectorError } from '../../types';
import type { BcClient } from '../client';
import {
  BC_BITCOIN_NOT_INSTALLED,
  BC_BITCOIN_NO_PERMISSION,
  BITCOIN_API,
  bcBitcoin,
  fromBcBitcoinWallet,
} from './bitcoin';

/* Fictional bank accounts; the descriptor is the public BIP84 test vector key. */
const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';

const clientWith = (all: (...args: unknown[]) => Promise<unknown>) =>
  ({ all: vi.fn(all) }) as unknown as BcClient & { all: ReturnType<typeof vi.fn> };

describe('fromBcBitcoinWallet', () => {
  it('maps the API row and the script type enum', () => {
    expect(
      fromBcBitcoinWallet({
        id: 'w1',
        bankAccountId: 'b1',
        number: 'BTC-01',
        displayName: 'Treasury',
        currencyCode: 'BTC',
        bitcoinWalletDescriptor: ` ${ZPUB} `,
        bitcoinScriptType: 'SHWPKH',
      })
    ).toEqual({
      bankAccountId: 'b1',
      bankAccountNumber: 'BTC-01',
      name: 'Treasury',
      currencyCode: 'BTC',
      descriptor: ZPUB,
      scriptType: 'sh-wpkh',
    });
  });

  it('leaves Automatic as undefined and skips accounts without a descriptor', () => {
    expect(
      fromBcBitcoinWallet({
        id: 'w1',
        bankAccountId: 'b1',
        number: 'BTC-01',
        bitcoinWalletDescriptor: ZPUB,
        bitcoinScriptType: 'Automatic',
      })?.scriptType
    ).toBeUndefined();
    expect(
      fromBcBitcoinWallet({
        id: 'w2',
        bankAccountId: 'b2',
        number: 'GBP-01',
        bitcoinWalletDescriptor: '',
      })
    ).toBeUndefined();
  });

  it('skips a wallet whose bank account no longer exists (empty GUID)', () => {
    expect(
      fromBcBitcoinWallet({
        id: 'w3',
        bankAccountId: '00000000-0000-0000-0000-000000000000',
        number: 'BTC-09',
        bitcoinWalletDescriptor: ZPUB,
      })
    ).toBeUndefined();
  });
});

describe('bcBitcoin', () => {
  it('reads bitcoinWallets from the Bookie Bitcoin extension API', async () => {
    const client = clientWith(async () => [
      {
        id: 'w1',
        bankAccountId: 'b1',
        number: 'BTC-01',
        displayName: 'Treasury',
        currencyCode: 'BTC',
        bitcoinWalletDescriptor: ZPUB,
      },
    ]);
    const result = await bcBitcoin(client).wallets();
    expect(client.all).toHaveBeenCalledWith('bitcoinWallets', {}, 10, BITCOIN_API);
    expect(result).toMatchObject({ status: 'ok', wallets: [{ bankAccountNumber: 'BTC-01' }] });
  });

  it('says the extension is missing on 404 and the permission set is missing on 403', async () => {
    const notFound = clientWith(async () => {
      throw new ConnectorError('Not found', 404, 'business-central');
    });
    expect(await bcBitcoin(notFound).wallets()).toEqual({
      status: 'unavailable',
      reason: BC_BITCOIN_NOT_INSTALLED,
    });
    const forbidden = clientWith(async () => {
      throw new ConnectorError('Forbidden', 403, 'business-central');
    });
    expect(await bcBitcoin(forbidden).wallets()).toEqual({
      status: 'unavailable',
      reason: BC_BITCOIN_NO_PERMISSION,
    });
  });

  it('lets other failures through', async () => {
    const broken = clientWith(async () => {
      throw new ConnectorError('Server error', 500, 'business-central');
    });
    await expect(bcBitcoin(broken).wallets()).rejects.toThrow('Server error');
  });
});
