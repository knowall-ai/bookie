import { btcToSats, satsToBtcNumber } from '@/lib/bitcoin/format';
import { ConnectorError } from '../../types';
import type {
  BitcoinWalletsModule,
  BtcJournalDraft,
  BtcJournalLine,
  BtcLedger,
  BtcLedgerEntry,
  SourceBitcoinWallet,
  SourceBitcoinWallets,
} from '../../types';
import { odataString, type BcClient } from '../client';
import { BOOKIE_API, bookieExtension, type BcBankLedgerEntry } from '../extension';
import { decodeBcEnum } from './accounts';
import { postAndRemoveBatch, type BcJournal } from './journals';

/**
 * Bitcoin wallets in Business Central: the Bookie BC extension
 * (`bc-extension/src/bitcoin/`) adds a descriptor and script type to each Bank Account
 * and publishes the ones that have a descriptor at `api/bookie/bitcoin/v1.0/bitcoinWallets`.
 *
 * Reconciling reads the BTC bank account's posted ledger entries through the Bookie
 * BC API extension, and drafts general-journal lines through API v2.0 on a batch of
 * Bookie's own (code `BTC…`), posted only when the user confirms.
 */
export const BITCOIN_API = 'bookie/bitcoin/v1.0';

export const BC_BITCOIN_NOT_INSTALLED =
  'The Bookie BC extension (version 1.2 or later) isn’t installed in this Business Central environment, so Bookie can’t see which bank accounts are Bitcoin wallets.';
export const BC_BITCOIN_NO_PERMISSION =
  'You don’t have the BOOKIE BTC READ permission set in this Business Central company, so Bookie can’t read its Bitcoin wallets.';
export const BC_LEDGER_NEEDS_EXTENSION =
  'Reconciling needs the bank account’s ledger entries, which Business Central’s standard API doesn’t publish. Install the Bookie BC extension (bc-extension/).';

/** Journal batch codes Bookie uses for BTC lines (Code[10]). */
export const BTC_BATCH_PREFIX = 'BTC';

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
  // No descriptor, or no bank account behind it any more (an empty GUID): not a wallet.
  if (!descriptor || !raw.bankAccountId || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(raw.bankAccountId)) {
    return undefined;
  }
  return {
    bankAccountId: raw.bankAccountId,
    bankAccountNumber: raw.number,
    name: raw.displayName || raw.number,
    currencyCode: raw.currencyCode ?? '',
    descriptor,
    scriptType: SCRIPT_TYPES[decodeBcEnum(raw.bitcoinScriptType)],
  };
}

/** A posted BTC bank ledger entry → satoshis. Reversed entries are left out by the caller. */
export function fromBcBtcLedgerEntry(raw: BcBankLedgerEntry): BtcLedgerEntry {
  return {
    id: raw.id,
    entryNumber: raw.entryNumber,
    postingDate: raw.postingDate.slice(0, 10),
    documentNumber: raw.documentNumber || undefined,
    externalDocumentNumber: raw.externalDocumentNumber || undefined,
    description: raw.description || undefined,
    amountSats: btcToSats(raw.amount),
    open: raw.open,
  };
}

interface BcBtcJournalLine {
  id: string;
  journalId: string;
  accountType?: string;
  accountNumber?: string;
  postingDate: string;
  documentNumber?: string;
  externalDocumentNumber?: string;
  amount: number;
  description?: string;
  balanceAccountType?: string;
  balancingAccountNumber?: string;
}

/** The API v2.0 journal line for one of Bookie's BTC lines. */
export function toBcBtcJournalLine(line: BtcJournalLine) {
  return {
    accountType: 'Bank Account',
    accountNumber: line.bankAccountNumber,
    postingDate: line.postingDate,
    documentNumber: line.documentNumber,
    externalDocumentNumber: line.externalDocumentNumber,
    // In the bank account's currency (BTC, 8 decimals): BC sets the currency from the account.
    amount: satsToBtcNumber(line.amountSats),
    description: line.description.slice(0, 100),
    balanceAccountType: 'G/L Account',
    balancingAccountNumber: line.balancingAccountNumber,
  };
}

function fromBcBtcJournalLine(raw: BcBtcJournalLine): BtcJournalLine {
  return {
    bankAccountNumber: raw.accountNumber ?? '',
    postingDate: raw.postingDate.slice(0, 10),
    documentNumber: raw.documentNumber ?? '',
    externalDocumentNumber: raw.externalDocumentNumber ?? '',
    description: raw.description ?? '',
    amountSats: btcToSats(raw.amount),
    balancingAccountNumber: raw.balancingAccountNumber ?? '',
  };
}

const isBankLine = (raw: BcBtcJournalLine, bankAccountNumber: string) =>
  decodeBcEnum(raw.accountType) === 'Bank Account' && raw.accountNumber === bankAccountNumber;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The batch name Bookie gives its BTC batches; with the BTC code, it marks a batch as Bookie's. */
export const BTC_BATCH_NAME = 'Bookie Bitcoin reconcile';

/**
 * One rule for "this is Bookie's draft for this wallet", used both to list drafts and
 * before posting: Bookie's batch code and name, at least one line, and every line on
 * this bank account. Anything else (an accountant's own BTC batch, a stray line) is
 * neither shown as Bookie's nor posted.
 */
export function isOwnBatch(
  batch: { code: string; displayName?: string },
  lines: BcBtcJournalLine[],
  bankAccountNumber: string
): boolean {
  return (
    batch.code.startsWith(BTC_BATCH_PREFIX) &&
    batch.displayName === BTC_BATCH_NAME &&
    lines.length > 0 &&
    lines.every((l) => isBankLine(l, bankAccountNumber))
  );
}

export function btcBatchCode(now = Date.now()): string {
  return `${BTC_BATCH_PREFIX}${now.toString(36).toUpperCase().slice(-7)}`;
}

export function bcBitcoin(client: BcClient): BitcoinWalletsModule {
  const batchLines = (batchId: string) =>
    client.all<BcBtcJournalLine>(`journals(${batchId})/journalLines`);

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

    async ledger(bankAccountNumber): Promise<BtcLedger> {
      if (!(await bookieExtension(client))) {
        return { status: 'unavailable', reason: BC_LEDGER_NEEDS_EXTENSION };
      }
      const rows = await client.all<BcBankLedgerEntry>(
        'bankAccountLedgerEntries',
        {
          $filter: `bankAccountNumber eq ${odataString(bankAccountNumber)}`,
          $orderby: 'postingDate desc,entryNumber desc',
        },
        10,
        BOOKIE_API
      );
      // A reversed entry and its reversal cancel out: neither is a transaction to match.
      return { status: 'ok', entries: rows.filter((r) => !r.reversed).map(fromBcBtcLedgerEntry) };
    },

    async drafts(bankAccountNumber): Promise<BtcJournalDraft[]> {
      const batches = (
        await client.all<BcJournal>('journals', { $select: 'id,code,displayName' })
      ).filter((b) => b.code.startsWith(BTC_BATCH_PREFIX) && b.displayName === BTC_BATCH_NAME);
      const drafts = await Promise.all(
        batches.map(async (batch) => {
          const lines = await batchLines(batch.id);
          return isOwnBatch(batch, lines, bankAccountNumber)
            ? { batchId: batch.id, batchCode: batch.code, lines: lines.map(fromBcBtcJournalLine) }
            : undefined;
        })
      );
      return drafts.filter((d): d is BtcJournalDraft => !!d);
    },

    async draftJournal(lines): Promise<BtcJournalDraft> {
      if (lines.length === 0) {
        throw new ConnectorError('Choose at least one transaction.', 400, 'business-central');
      }
      const code = btcBatchCode();
      const batch = await client.request<BcJournal>('journals', {
        method: 'POST',
        body: { code, displayName: BTC_BATCH_NAME },
      });
      try {
        for (const line of lines) {
          await client.request(`journals(${batch.id})/journalLines`, {
            method: 'POST',
            body: toBcBtcJournalLine(line),
          });
        }
      } catch (error) {
        // Don't leave half a draft behind.
        await client
          .request(`journals(${batch.id})`, { method: 'DELETE', etag: '*' })
          .catch(() => {});
        throw error;
      }
      return { batchId: batch.id, batchCode: batch.code ?? code, lines };
    },

    async postJournal(bankAccountNumber, batchId) {
      if (!GUID.test(batchId))
        throw new ConnectorError('Unknown journal batch.', 400, 'business-central');
      const batch = await client.request<BcJournal>(`journals(${batchId})`, {
        query: { $select: 'id,code,displayName' },
      });
      const lines = await batchLines(batchId);
      // Only a batch Bookie drafted for this wallet's bank account, and nothing else in it.
      if (!isOwnBatch(batch, lines, bankAccountNumber)) {
        throw new ConnectorError(
          'That journal batch isn’t one Bookie drafted for this wallet, so Bookie won’t post it.',
          400,
          'business-central'
        );
      }
      try {
        await postAndRemoveBatch(client, batchId);
      } catch (error) {
        // postAndRemoveBatch deletes a batch BC refused to post: say so, so nobody looks for it.
        if (error instanceof ConnectorError) {
          throw new ConnectorError(
            `${error.message} Business Central didn't post it. Bookie tried to remove the draft batch: check Business Central for it, then draft the lines again once that's fixed.`,
            error.status,
            'business-central'
          );
        }
        throw error;
      }
    },
  };
}
