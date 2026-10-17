import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The public helper's "are you a person?" pass.
 *
 * The widget first proves itself, with Cloudflare Turnstile when it is
 * configured or else a small proof-of-work, and gets back a signed pass valid
 * for PASS_TTL_MS and bound to its IP. Chat and voice require the pass. The
 * same key signs Bookie's chat replies so a visitor cannot forge an
 * "assistant" turn in the history they send back.
 *
 * Keyed by PUBLIC_BOOKIE_SECRET (32+ random bytes, its own secret, nothing to
 * do with the portal's keys). Without it a random key is made per process:
 * fine for one instance; passes then reset on restart.
 */
const PASS_TTL_MS = 30 * 60_000;
const CHALLENGE_TTL_MS = 5 * 60_000;

let processKey: Buffer | undefined;
function key(): Buffer {
  const configured = process.env.PUBLIC_BOOKIE_SECRET;
  if (configured && configured.length >= 32) return Buffer.from(configured);
  processKey ??= randomBytes(32);
  return processKey;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (purpose: string, data: string) =>
  createHmac('sha256', key()).update(`${purpose}\n${data}`).digest('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const ipTag = (ip: string) => mac('ip', ip).slice(0, 16);

// ---- Proof of work --------------------------------------------------------

/** A challenge string: `<expires>.<random>.<ip tag>.<mac>`. */
export function issueChallenge(ip: string, now = Date.now()): string {
  const body = `${now + CHALLENGE_TTL_MS}.${b64(randomBytes(12))}.${ipTag(ip)}`;
  return `${body}.${mac('challenge', body)}`;
}

/** Leading zero bits of a digest. */
export function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    bits += Math.clz32(byte) - 24;
    break;
  }
  return bits;
}

const spent = new Map<string, number>();

/** Checks a solved challenge: signed, unexpired, same IP, enough work, and not reused. */
export function verifyProofOfWork(
  challenge: string,
  nonce: string,
  ip: string,
  bits: number,
  now = Date.now()
): boolean {
  const parts = challenge.split('.');
  if (parts.length !== 4 || nonce.length > 32) return false;
  const [expires, , tag, signature] = parts;
  const body = parts.slice(0, 3).join('.');
  if (!safeEqual(signature, mac('challenge', body))) return false;
  if (Number(expires) < now || !safeEqual(tag, ipTag(ip))) return false;
  if (spent.has(challenge)) return false;
  const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
  if (leadingZeroBits(digest) < bits) return false;
  spent.set(challenge, Number(expires));
  if (spent.size > 20_000) {
    for (const [c, exp] of spent) if (exp < now) spent.delete(c);
  }
  return true;
}

// ---- Turnstile ------------------------------------------------------------

export async function verifyTurnstile(token: string, secret: string, ip: string) {
  if (!token || token.length > 2048) return false;
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    cache: 'no-store',
  }).catch(() => undefined);
  const body = (await response?.json().catch(() => ({}))) as { success?: boolean } | undefined;
  return body?.success === true;
}

// ---- Pass -----------------------------------------------------------------

export function issuePass(ip: string, now = Date.now()): string {
  const body = `${now + PASS_TTL_MS}.${b64(randomBytes(9))}.${ipTag(ip)}`;
  return `${body}.${mac('pass', body)}`;
}

/** Returns the pass id (for per-pass limits) when valid. */
export function verifyPass(
  pass: string | null | undefined,
  ip: string,
  now = Date.now()
): string | undefined {
  if (!pass || pass.length > 200) return undefined;
  const parts = pass.split('.');
  if (parts.length !== 4) return undefined;
  const [expires, id, tag, signature] = parts;
  if (!safeEqual(signature, mac('pass', parts.slice(0, 3).join('.')))) return undefined;
  if (Number(expires) < now || !safeEqual(tag, ipTag(ip))) return undefined;
  return id;
}

// ---- Signed replies -------------------------------------------------------

export const signReply = (text: string) => mac('reply', text).slice(0, 32);
export const verifyReply = (text: string, sig: string | undefined) =>
  !!sig && safeEqual(sig, signReply(text));
