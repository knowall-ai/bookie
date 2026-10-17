'use client';

import type { PassChallenge } from '@/lib/public-bookie/shared';

/**
 * Gets (and caches) the widget's "I am a person" pass from /api/public/pass.
 * With Turnstile configured the panel shows Cloudflare's check; otherwise the
 * browser quietly solves a small proof-of-work (about 65,000 SHA-256 hashes,
 * well under a second or two), which makes scripted abuse cost something.
 */
let cached: { pass: string; expires: number } | undefined;
let pending: Promise<string> | undefined;

export type TurnstileRenderer = (siteKey: string) => Promise<string>;

export function clearPass() {
  cached = undefined;
}

export function getPass(renderTurnstile: TurnstileRenderer): Promise<string> {
  if (cached && cached.expires > Date.now() + 30_000) return Promise.resolve(cached.pass);
  pending ??= fetchPass(renderTurnstile).finally(() => (pending = undefined));
  return pending;
}

async function fetchPass(renderTurnstile: TurnstileRenderer): Promise<string> {
  const res = await fetch('/api/public/pass', { cache: 'no-store' });
  const challenge = (await res.json().catch(() => ({}))) as PassChallenge & { error?: string };
  if (!res.ok) throw new Error(challenge.error ?? 'Bookie is unavailable just now.');
  const body =
    challenge.mode === 'turnstile'
      ? { turnstileToken: await renderTurnstile(challenge.siteKey) }
      : { challenge: challenge.challenge, nonce: await solve(challenge.challenge, challenge.bits) };
  const verified = await fetch('/api/public/pass', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await verified.json().catch(() => ({}))) as {
    pass?: string;
    expiresInSeconds?: number;
    error?: string;
  };
  if (!verified.ok || !result.pass) throw new Error(result.error ?? 'Verification failed.');
  cached = { pass: result.pass, expires: Date.now() + (result.expiresInSeconds ?? 600) * 1000 };
  return result.pass;
}

function zeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Finds a nonce so SHA-256(`challenge:nonce`) starts with `bits` zero bits. */
export async function solve(challenge: string, bits: number): Promise<string> {
  const encoder = new TextEncoder();
  const BATCH = 512;
  for (let start = 0; start < 50_000_000; start += BATCH) {
    const nonces = Array.from({ length: BATCH }, (_, i) => (start + i).toString(36));
    const digests = await Promise.all(
      nonces.map((n) => crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${n}`)))
    );
    const hit = digests.findIndex((d) => zeroBits(new Uint8Array(d)) >= bits);
    if (hit >= 0) return nonces[hit];
  }
  throw new Error('Verification took too long.');
}
