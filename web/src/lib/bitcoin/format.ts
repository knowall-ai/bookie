/** Bitcoin amounts are integer satoshis everywhere; these format and convert them exactly. */

/** Satoshis → BTC string with 8 decimals, e.g. 150000 → "0.00150000". */
export function satsToBtc(sats: number): string {
  const sign = sats < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(sats));
  return `${sign}${Math.floor(abs / 1e8).toLocaleString('en-GB')}.${String(abs % 1e8).padStart(8, '0')}`;
}

/** "0.00150000 BTC", "+0.00150000 BTC", "−0.00061000 BTC". */
export function formatBtc(sats: number, options: { sign?: boolean } = {}): string {
  const text = satsToBtc(Math.abs(sats));
  const sign = sats < 0 ? '−' : options.sign && sats > 0 ? '+' : '';
  return `${sign}${text} BTC`;
}

/** A BTC decimal (as Business Central holds it) → satoshis, exactly. */
export function btcToSats(btcAmount: number): number {
  return Math.round(btcAmount * 1e8);
}

/** Satoshis → a BTC number for Business Central (8 decimals). */
export function satsToBtcNumber(sats: number): number {
  return Number(satsToBtc(sats).replace(/,/g, ''));
}

/** Shorten a txid for tables: first 10 and last 6 characters. */
export function shortTxid(txid: string): string {
  return txid.length > 20 ? `${txid.slice(0, 10)}…${txid.slice(-6)}` : txid;
}
