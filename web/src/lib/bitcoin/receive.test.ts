import { describe, expect, it } from 'vitest';
import { bip21Uri, parseBtcAmount } from './receive';

// The BIP84 test vector's first receive address (a public test key, not anyone's wallet).
const ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

describe('bip21Uri', () => {
  it('is bitcoin:<address> without an amount', () => {
    expect(bip21Uri(ADDRESS)).toBe(`bitcoin:${ADDRESS}`);
  });

  it('adds ?amount= in BTC', () => {
    expect(bip21Uri(ADDRESS, '0.0015')).toBe(`bitcoin:${ADDRESS}?amount=0.0015`);
  });
});

describe('parseBtcAmount', () => {
  it('reads BTC to exact satoshis and a BIP21 decimal', () => {
    expect(parseBtcAmount('0.0015')).toEqual({ ok: true, sats: 150_000, btc: '0.0015' });
    expect(parseBtcAmount(' 1 ')).toEqual({ ok: true, sats: 100_000_000, btc: '1' });
    expect(parseBtcAmount('0.10000000')).toEqual({ ok: true, sats: 10_000_000, btc: '0.1' });
    expect(parseBtcAmount('.5')).toEqual({ ok: true, sats: 50_000_000, btc: '0.5' });
    expect(parseBtcAmount('007.')).toEqual({ ok: true, sats: 700_000_000, btc: '7' });
    expect(parseBtcAmount('0.00000001')).toEqual({ ok: true, sats: 1, btc: '0.00000001' });
    expect(parseBtcAmount('21000000')).toMatchObject({ ok: true, sats: 2_100_000_000_000_000 });
  });

  it('refuses zero, negatives, junk and more than 8 decimals', () => {
    expect(parseBtcAmount('0')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/above zero/),
    });
    expect(parseBtcAmount('0.00000000')).toMatchObject({ ok: false });
    expect(parseBtcAmount('-0.1')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/amount in BTC/),
    });
    expect(parseBtcAmount('1e-3')).toMatchObject({ ok: false });
    expect(parseBtcAmount('1,000')).toMatchObject({ ok: false });
    expect(parseBtcAmount('abc')).toMatchObject({ ok: false });
    expect(parseBtcAmount('.')).toMatchObject({ ok: false });
    expect(parseBtcAmount('0.000000001')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/8 decimal/),
    });
  });

  it('refuses more than the 21 million BTC supply', () => {
    expect(parseBtcAmount('21000000.00000001')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/21 million/),
    });
    expect(parseBtcAmount('123456789')).toMatchObject({
      ok: false,
      error: expect.stringMatching(/21 million/),
    });
  });
});
