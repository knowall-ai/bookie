/**
 * Receiving a payment: the BIP21 URI a wallet app reads from a QR code, and the
 * optional amount a person types (BTC, up to 8 decimals). Pure, so the dialog can
 * rebuild the URI in the browser as the amount changes.
 */

/** No amount can exceed the 21 million BTC supply. */
const MAX_SATS = 21_000_000 * 1e8;

export type AmountResult = { ok: true; sats: number; btc: string } | { ok: false; error: string };

/**
 * Parse an amount in BTC: digits with an optional point and at most 8 decimals,
 * above zero. Returns exact satoshis and the BIP21 decimal (no trailing zeros).
 */
export function parseBtcAmount(input: string): AmountResult {
  const text = input.trim();
  const match = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/.exec(text);
  if (!match) return { ok: false, error: 'Enter an amount in BTC, like 0.0015.' };
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? match[3] ?? '';
  if (fraction.length > 8) return { ok: false, error: 'BTC has at most 8 decimal places.' };
  if (whole.replace(/^0+/, '').length > 8) {
    return { ok: false, error: 'That is more than 21 million BTC.' };
  }
  const sats = Number(whole) * 1e8 + Number(fraction.padEnd(8, '0'));
  if (sats <= 0) return { ok: false, error: 'The amount must be above zero.' };
  if (sats > MAX_SATS) return { ok: false, error: 'That is more than 21 million BTC.' };
  const trimmed = fraction.replace(/0+$/, '');
  const btc = `${Number(whole)}${trimmed ? `.${trimmed}` : ''}`;
  return { ok: true, sats, btc };
}

/** `bitcoin:<address>`, with `?amount=<btc>` when an amount (BIP21 decimal) is given. */
export function bip21Uri(address: string, amountBtc?: string): string {
  return amountBtc ? `bitcoin:${address}?amount=${amountBtc}` : `bitcoin:${address}`;
}
