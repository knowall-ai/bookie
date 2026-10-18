/**
 * The demo organisation's Bitcoin wallet: fictional data only, reachable only with
 * BOOKIE_DEV_AUTH=demo (production refuses it). Transaction ids are hashes of
 * made-up labels, not transactions on any chain; the prices are fictional and say so.
 */
import { hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import type { GbpRate } from './kraken';
import type { ChainTransaction, WalletScan } from './scan';

export const DEMO_WALLET_ID = 'demo-contoso-treasury';
export const DEMO_WALLET_ORG = 'demo.contoso';
export const DEMO_WALLET_BC_BANK = 'BTC-TREASURY';

const fakeTxid = (label: string) =>
  hex.encode(sha256(new TextEncoder().encode(`bookie-demo:${label}`)));
const at = (iso: string) => Date.parse(iso) / 1000;

const TIP = 919_400;

interface DemoTx {
  label: string;
  height?: number;
  time?: string;
  netSats: number;
  feeSats?: number;
  /** Fictional GBP per BTC for the demo's "rate". */
  demoRate?: number;
}

const DEMO_TXS: DemoTx[] = [
  { label: 'pending-receive', netSats: 100_000 },
  {
    label: 'receive-oct',
    height: 919_100,
    time: '2026-10-14T10:12:00Z',
    netSats: 450_000,
    demoRate: 51_820,
  },
  {
    label: 'send-oct',
    height: 917_390,
    time: '2026-10-02T15:40:00Z',
    netSats: -3_001_500,
    feeSats: 1_500,
    demoRate: 50_410,
  },
  {
    label: 'receive-sep',
    height: 914_900,
    time: '2026-09-15T09:05:00Z',
    netSats: 1_200_000,
    demoRate: 48_960,
  },
  {
    label: 'send-aug',
    height: 911_330,
    time: '2026-08-21T13:22:00Z',
    netSats: -5_002_100,
    feeSats: 2_100,
    demoRate: 47_300,
  },
  {
    label: 'receive-aug',
    height: 908_760,
    time: '2026-08-03T11:48:00Z',
    netSats: 25_000_000,
    demoRate: 46_150,
  },
];

export function demoTxid(label: string) {
  return fakeTxid(label);
}

export function demoWalletScan(now = new Date()): WalletScan {
  const transactions: ChainTransaction[] = DEMO_TXS.map((t) => {
    const pending = t.height === undefined;
    const out = t.netSats < 0;
    return {
      txid: fakeTxid(t.label),
      height: t.height,
      blockTime: t.time ? at(t.time) : undefined,
      confirmations: pending ? 0 : TIP - t.height! + 1,
      pending,
      receivedSats: out ? 0 : t.netSats,
      sentSats: out ? -t.netSats : 0,
      netSats: t.netSats,
      feeSats: t.feeSats,
      direction: out ? 'out' : 'in',
    };
  });
  const confirmed = transactions.filter((t) => !t.pending).reduce((s, t) => s + t.netSats, 0);
  const pending = transactions.filter((t) => t.pending).reduce((s, t) => s + t.netSats, 0);
  return {
    tip: { height: TIP, time: at('2026-10-17T12:00:00Z') },
    transactions,
    balance: { confirmedSats: confirmed, pendingSats: pending },
    used: { receive: 4, change: 2 },
    derived: { receive: 24, change: 22 },
    scannedAt: now.toISOString(),
  };
}

const demoLabel = (time: number) =>
  `Demo price (fictional), ${new Date(time * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;

/** Fictional rates for the demo wallet's block times. */
export function demoRates(blockTimes: number[]): Map<number, GbpRate | string> {
  const out = new Map<number, GbpRate | string>();
  for (const time of blockTimes) {
    const tx = DEMO_TXS.find((t) => t.time && at(t.time) === time);
    if (!tx?.demoRate) {
      out.set(time, 'No demo price for this date.');
      continue;
    }
    out.set(time, {
      gbpPerBtc: tx.demoRate,
      source: 'demo',
      rateTime: new Date(time * 1000).toISOString(),
      label: demoLabel(time),
    });
  }
  return out;
}

export const DEMO_LATEST_RATE: GbpRate = {
  gbpPerBtc: 52_000,
  source: 'demo',
  rateTime: '2026-10-17T12:00:00.000Z',
  label: 'Demo price (fictional), 17 Oct 2026',
};
