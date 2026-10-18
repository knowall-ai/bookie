import { ConnectorError } from '../../types';
import type { BitcoinWalletsModule, SourceBitcoinWallet, SourceBitcoinWallets } from '../../types';
import type { BcClient } from '../client';
import { decodeBcEnum } from './accounts';

/**
 * Bitcoin wallets in Business Central: the Bookie Bitcoin extension
 * (`bc-extension-bitcoin/`) adds a descriptor and script type to each Bank Account
 * and publishes the ones that have a descriptor at `api/bookie/bitcoin/v1.0/bitcoinWallets`.
 */
export const BITCOIN_API = 'bookie/bitcoin/v1.0';

export const BC_BITCOIN_NOT_INSTALLED =
  'The Bookie Bitcoin extension isn’t installed in this Business Central environment, so Bookie can’t see which bank accounts are Bitcoin wallets.';
export const BC_BITCOIN_NO_PERMISSION =
  'You don’t have the BOOKIE BTC READ permission set in this Business Central company, so Bookie can’t read its Bitcoin wallets.';

export interface BcBitcoinWallet {
  /** The wallet record's own id. */
  id: string;
  /** The Bank Account SystemId, the same id API v2.0 bankAccounts uses. */
  bankAccountId: string;
  number: string;
  displayName?: string;
  currencyCode?: string;
  bitcoinWalletDescriptor?: string;
  bitcoinScriptType?: string;
}

const SCRIPT_TYPES: Record<string, SourceBitcoinWallet['scriptType']> = {
  WPKH: 'wpkh',
  SHWPKH: 'sh-wpkh',
  TR: 'tr',
  WSHMulti: 'wsh-multi',
  PKH: 'pkh',
};

/** BC enum name → script type; `Automatic` (or anything else) → undefined. */
export function fromBcBitcoinWallet(raw: BcBitcoinWallet): SourceBitcoinWallet | undefined {
  const descriptor = raw.bitcoinWalletDescriptor?.trim();
  if (!descriptor) return undefined;
  return {
    bankAccountId: raw.bankAccountId,
    bankAccountNumber: raw.number,
    name: raw.displayName || raw.number,
    currencyCode: raw.currencyCode ?? '',
    descriptor,
    scriptType: SCRIPT_TYPES[decodeBcEnum(raw.bitcoinScriptType)],
  };
}

export function bcBitcoin(client: BcClient): BitcoinWalletsModule {
  return {
    async wallets(): Promise<SourceBitcoinWallets> {
      try {
        const rows = await client.all<BcBitcoinWallet>('bitcoinWallets', {}, 10, BITCOIN_API);
        return {
          status: 'ok',
          wallets: rows.map(fromBcBitcoinWallet).filter((w): w is SourceBitcoinWallet => !!w),
        };
      } catch (error) {
        if (error instanceof ConnectorError && error.status === 404) {
          return { status: 'unavailable', reason: BC_BITCOIN_NOT_INSTALLED };
        }
        if (error instanceof ConnectorError && error.status === 403) {
          return { status: 'unavailable', reason: BC_BITCOIN_NO_PERMISSION };
        }
        throw error;
      }
    },
  };
}
