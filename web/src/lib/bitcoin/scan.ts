/**
 * Read a watch-only wallet's history from an Electrum server: derive the receive
 * and change chains until `gapLimit` unused addresses in a row, collect every
 * transaction that touches them, and work out what each one did to the wallet.
 *
 * Nothing here is stored. Amounts are integer satoshis. A transaction the server
 * reports at height 0 or below is in the mempool: pending, never settled.
 */
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import {
  electrumScriptHash,
  scriptDeriver,
  type Chain,
  type DerivedScript,
  type WalletDescriptor,
} from './descriptor';
import type { ElectrumApi } from './electrum';
import { WalletError } from './errors';

export const GAP_LIMIT = 20;
/** Safety cap per chain, so a broken server can't make Bookie derive forever. */
export const MAX_ADDRESSES_PER_CHAIN = 5_000;
/** Bookie reads wallets live; past this many transactions it stops rather than load them all. */
export const MAX_TRANSACTIONS = 10_000;

export interface ChainTransaction {
  txid: string;
  /** Block height; undefined while pending. */
  height?: number;
  /** Block header time (unix seconds); undefined while pending. */
  blockTime?: number;
  confirmations: number;
  pending: boolean;
  /** Satoshis paid to the wallet's own scripts. */
  receivedSats: number;
  /** Satoshis spent from the wallet's own outputs. */
  sentSats: number;
  /** received − sent: positive is money in. A send includes its fee. */
  netSats: number;
  /**
   * Network fee in satoshis, only when the wallet funded every input (so the whole fee
   * is the wallet's) and every input's value was known. Undefined otherwise: Bookie
   * doesn't guess a share of a fee on a jointly funded transaction.
   */
  feeSats?: number;
  /** The wallet funded some, but not all, of the inputs (payjoin, coinjoin). */
  sharedInputs?: boolean;
  direction: 'in' | 'out' | 'self';
}

export interface WalletScan {
  tip: { height: number; time?: number };
  transactions: ChainTransaction[];
  balance: { confirmedSats: number; pendingSats: number };
  /** Addresses with history, per chain. */
  used: Record<Chain, number>;
  /** Addresses derived (used + the trailing gap), per chain. */
  derived: Record<Chain, number>;
  /**
   * The first receive index after the highest one with history (0 when none has any):
   * where a fresh receive address comes from. Not `used.receive`: the chain can have gaps.
   */
  nextReceiveIndex: number;
  scannedAt: string;
}

interface HistoryEntry {
  tx_hash: string;
  height: number;
}

interface BalanceResult {
  confirmed: number;
  unconfirmed: number;
}

/** Block header time: bytes 68..72 of the 80-byte header, little-endian. */
export function headerTime(headerHex: string): number {
  const bytes = hex.decode(headerHex);
  if (bytes.length < 80) throw new Error('Short block header.');
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(68, true);
}

export interface ParsedTx {
  txid: string;
  inputs: { txid: string; index: number }[];
  outputs: { script: string; sats: number }[];
}

export function parseRawTx(rawHex: string): ParsedTx {
  const tx = btc.Transaction.fromRaw(hex.decode(rawHex), {
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
    disableScriptCheck: true,
    allowLegacyWitnessUtxo: true,
  });
  const inputs: ParsedTx['inputs'] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const input = tx.getInput(i);
    if (!input.txid || input.index === undefined) continue;
    inputs.push({ txid: hex.encode(input.txid), index: input.index });
  }
  const outputs: ParsedTx['outputs'] = [];
  for (let i = 0; i < tx.outputsLength; i++) {
    const output = tx.getOutput(i);
    outputs.push({
      script: output.script ? hex.encode(output.script) : '',
      sats: Number(output.amount ?? 0n),
    });
  }
  return { txid: tx.id, inputs, outputs };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * The first receive index from `start` with no history, asked of the server now: a
 * cached scan can be minutes old, and an address paid since then isn't fresh any more.
 * Gives up after `gapLimit` used addresses in a row rather than walk the chain.
 */
export async function firstUnusedReceiveIndex(
  descriptor: WalletDescriptor,
  electrum: ElectrumApi,
  start: number,
  gapLimit = GAP_LIMIT
): Promise<number> {
  const derive = scriptDeriver(descriptor);
  for (let index = start; index < start + gapLimit; index++) {
    const history = await electrum.request<HistoryEntry[]>('blockchain.scripthash.get_history', [
      electrumScriptHash(derive('receive', index).script),
    ]);
    if (!history?.length) return index;
  }
  throw new WalletError(
    `The next ${gapLimit} receive addresses have all been used since the wallet was read. Try again in a few minutes.`
  );
}

export interface ScanOptions {
  gapLimit?: number;
  concurrency?: number;
  now?: () => Date;
}

export async function scanWallet(
  descriptor: WalletDescriptor,
  electrum: ElectrumApi,
  options: ScanOptions = {}
): Promise<WalletScan> {
  const gapLimit = options.gapLimit ?? GAP_LIMIT;
  const concurrency = options.concurrency ?? 20;
  const derive = scriptDeriver(descriptor);
  const chains: Chain[] = descriptor.hasChange ? ['receive', 'change'] : ['receive'];

  const ours = new Map<string, DerivedScript>();
  const usedHashes: string[] = [];
  const history = new Map<string, number>();
  const used: Record<Chain, number> = { receive: 0, change: 0 };
  const derived: Record<Chain, number> = { receive: 0, change: 0 };
  let nextReceiveIndex = 0;

  for (const chain of chains) {
    let index = 0;
    let gap = 0;
    while (gap < gapLimit) {
      if (index >= MAX_ADDRESSES_PER_CHAIN) {
        throw new Error(
          `Stopped after ${MAX_ADDRESSES_PER_CHAIN} addresses on the ${chain} chain.`
        );
      }
      const batch = Array.from({ length: gapLimit - gap }, (_, i) => derive(chain, index + i));
      const histories = await mapLimit(batch, concurrency, (s) =>
        electrum.request<HistoryEntry[]>('blockchain.scripthash.get_history', [
          electrumScriptHash(s.script),
        ])
      );
      batch.forEach((script, i) => {
        ours.set(script.script, script);
        derived[chain]++;
        const entries = histories[i] ?? [];
        if (entries.length === 0) {
          gap++;
          return;
        }
        gap = 0;
        used[chain]++;
        if (chain === 'receive') nextReceiveIndex = Math.max(nextReceiveIndex, script.index + 1);
        usedHashes.push(electrumScriptHash(script.script));
        for (const entry of entries) history.set(entry.tx_hash, entry.height);
      });
      index += batch.length;
    }
  }

  const [tipHeader, balances] = await Promise.all([
    electrum.request<{ height: number; hex: string }>('blockchain.headers.subscribe', []),
    mapLimit(usedHashes, concurrency, (h) =>
      electrum.request<BalanceResult>('blockchain.scripthash.get_balance', [h])
    ),
  ]);

  // Every transaction in the history. (Outside transactions aren't needed: a fee is only
  // reported when the wallet funded every input, and those inputs are in the history.)
  const txids = [...history.keys()];
  if (txids.length > MAX_TRANSACTIONS) {
    throw new WalletError(
      `This wallet has more than ${MAX_TRANSACTIONS.toLocaleString('en-GB')} transactions, more than Bookie reads live.`
    );
  }
  const raw = new Map<string, ParsedTx>();
  const fetchTxs = async (ids: string[]) => {
    const fetched = await mapLimit(ids, concurrency, (id) =>
      electrum.request<string>('blockchain.transaction.get', [id, false])
    );
    ids.forEach((id, i) => raw.set(id, parseRawTx(fetched[i])));
  };
  await fetchTxs(txids);

  const isOurInput = (input: { txid: string; index: number }) => {
    const prev = raw.get(input.txid);
    const out = history.has(input.txid) ? prev?.outputs[input.index] : undefined;
    return out && ours.has(out.script) ? out : undefined;
  };

  const heights = [...new Set([...history.values()].filter((h) => h > 0))];
  const headers = await mapLimit(heights, concurrency, (h) =>
    electrum.request<string>('blockchain.block.header', [h])
  );
  const blockTimes = new Map(heights.map((h, i) => [h, headerTime(headers[i])]));

  const transactions: ChainTransaction[] = txids.map((txid) => {
    const tx = raw.get(txid)!;
    const height = history.get(txid)!;
    const pending = height <= 0;
    const receivedSats = tx.outputs.reduce((s, o) => s + (ours.has(o.script) ? o.sats : 0), 0);
    let sentSats = 0;
    let ourInputs = 0;
    for (const input of tx.inputs) {
      const mine = isOurInput(input);
      if (mine) {
        sentSats += mine.sats;
        ourInputs++;
      }
    }
    const outputTotal = tx.outputs.reduce((s, o) => s + o.sats, 0);
    const allInputsOurs = ourInputs > 0 && ourInputs === tx.inputs.length;
    const feeSats = allInputsOurs && sentSats >= outputTotal ? sentSats - outputTotal : undefined;
    const sharedInputs = ourInputs > 0 && !allInputsOurs;
    const netSats = receivedSats - sentSats;
    const allOurs = tx.outputs.every((o) => ours.has(o.script));
    return {
      txid,
      height: pending ? undefined : height,
      blockTime: pending ? undefined : blockTimes.get(height),
      confirmations: pending ? 0 : Math.max(0, tipHeader.height - height + 1),
      pending,
      receivedSats,
      sentSats,
      netSats,
      feeSats,
      ...(sharedInputs ? { sharedInputs } : {}),
      direction: sentSats > 0 && allOurs ? 'self' : netSats >= 0 ? 'in' : 'out',
    };
  });

  transactions.sort((a, b) => {
    if (a.pending !== b.pending) return a.pending ? -1 : 1;
    return (b.height ?? 0) - (a.height ?? 0) || a.txid.localeCompare(b.txid);
  });

  return {
    tip: { height: tipHeader.height, time: tipHeader.hex ? headerTime(tipHeader.hex) : undefined },
    transactions,
    balance: {
      confirmedSats: balances.reduce((s, b) => s + (b?.confirmed ?? 0), 0),
      pendingSats: balances.reduce((s, b) => s + (b?.unconfirmed ?? 0), 0),
    },
    used,
    derived,
    nextReceiveIndex,
    scannedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}
