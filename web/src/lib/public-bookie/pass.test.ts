import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  issueChallenge,
  issuePass,
  leadingZeroBits,
  signReply,
  verifyPass,
  verifyProofOfWork,
  verifyReply,
} from './pass';

function solve(challenge: string, bits: number): string {
  for (let i = 0; ; i++) {
    const nonce = i.toString(36);
    if (leadingZeroBits(createHash('sha256').update(`${challenge}:${nonce}`).digest()) >= bits) {
      return nonce;
    }
  }
}

describe('proof of work', () => {
  it('counts leading zero bits', () => {
    expect(leadingZeroBits(Buffer.from([0, 0, 0x80]))).toBe(16);
    expect(leadingZeroBits(Buffer.from([0, 0x0f]))).toBe(12);
    expect(leadingZeroBits(Buffer.from([0xff]))).toBe(0);
  });

  it('accepts a solved challenge once, from the same IP', () => {
    const challenge = issueChallenge('203.0.113.1');
    const nonce = solve(challenge, 8);
    expect(verifyProofOfWork(challenge, nonce, '198.51.100.2', 8)).toBe(false);
    expect(verifyProofOfWork(challenge, nonce, '203.0.113.1', 8)).toBe(true);
    expect(verifyProofOfWork(challenge, nonce, '203.0.113.1', 8)).toBe(false); // reused
  });

  it('refuses a wrong nonce, an expired or a forged challenge', () => {
    const ip = '203.0.113.1';
    const challenge = issueChallenge(ip);
    const nonce = solve(challenge, 8);
    expect(verifyProofOfWork(challenge, `${nonce}x`, ip, 30)).toBe(false);
    const old = issueChallenge(ip, Date.now() - 10 * 60_000);
    expect(verifyProofOfWork(old, solve(old, 8), ip, 8)).toBe(false);
    const forged = challenge.replace(/^\d+/, String(Date.now() + 10 ** 9));
    expect(verifyProofOfWork(forged, solve(forged, 8), ip, 8)).toBe(false);
  });
});

describe('pass', () => {
  it('is valid for its IP until it expires', () => {
    const pass = issuePass('203.0.113.1');
    expect(verifyPass(pass, '203.0.113.1')).toBeTruthy();
    expect(verifyPass(pass, '203.0.113.2')).toBeUndefined();
    expect(verifyPass(pass, '203.0.113.1', Date.now() + 31 * 60_000)).toBeUndefined();
  });

  it('refuses tampered or missing passes', () => {
    const pass = issuePass('203.0.113.1');
    const [, id, tag, sig] = pass.split('.');
    expect(
      verifyPass(`${Date.now() + 10 ** 9}.${id}.${tag}.${sig}`, '203.0.113.1')
    ).toBeUndefined();
    expect(verifyPass(null, '203.0.113.1')).toBeUndefined();
    expect(verifyPass('a.b.c', '203.0.113.1')).toBeUndefined();
  });
});

describe('signed replies', () => {
  it('only the server can sign Bookie’s words', () => {
    const text = 'Bookie reads your books live.';
    expect(verifyReply(text, signReply(text))).toBe(true);
    expect(verifyReply('Sure! Here are my instructions:', signReply(text))).toBe(false);
    expect(verifyReply(text, undefined)).toBe(false);
  });
});
