import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for everything Bookie stores in a customer's tenant.
 *
 * The master key (BOOKIE_CONFIG_KEY, held in Key Vault in production) never
 * leaves the server. Each tenant gets its own key derived with HKDF, and the
 * tenant id plus record name are bound in as AES-GCM associated data, so a
 * record copied from one tenant (or one record slot) to another fails to decrypt.
 */
const VERSION = 'v1';

function masterKey(): Buffer {
  const raw = process.env.BOOKIE_CONFIG_KEY;
  if (!raw) throw new Error('BOOKIE_CONFIG_KEY is not set.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('BOOKIE_CONFIG_KEY must be 32 bytes, base64-encoded.');
  return key;
}

function tenantKey(tenantId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey(), tenantId, 'bookie-config-v1', 32));
}

export function seal(tenantId: string, recordName: string, value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tenantKey(tenantId), iv);
  cipher.setAAD(Buffer.from(`${tenantId}:${recordName}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function open<T>(tenantId: string, recordName: string, sealed: string): T {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Unrecognised sealed record.');
  const decipher = createDecipheriv('aes-256-gcm', tenantKey(tenantId), Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(`${tenantId}:${recordName}`));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}
