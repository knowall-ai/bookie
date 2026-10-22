import { isIP } from 'node:net';

export const SSL_REQUIRED =
  "Use an ssl:// address: Bookie only connects to an organisation's own server over TLS.";

/** Validate syntax here; DNS answers are checked immediately before connecting. */
export function validateOrgElectrumUrl(url: string): {
  protocol: 'ssl';
  host: string;
  port: number;
  guarded: true;
} {
  if (!url.startsWith('ssl://')) throw new Error(SSL_REQUIRED);
  const match = /^ssl:\/\/(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9.-]+):(\d{1,5})$/.exec(url);
  if (!match) throw new Error('Use an ssl://host:port address.');
  const host = match[1].replace(/^\[|\]$/g, '').toLowerCase();
  const name = host.replace(/\.$/, '');
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new Error('The Electrum port is out of range.');
  if (
    !isIP(host) &&
    (host.includes(':') ||
      /^[0-9.]+$/.test(host) ||
      name.length > 253 ||
      !name.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))
  ) {
    throw new Error('Use a valid DNS name or IP address.');
  }
  if (/^(localhost|local|internal)$|\.(localhost|local|internal)$/.test(name)) {
    throw new Error("That Electrum server's address isn't a public internet address.");
  }
  return { protocol: 'ssl', host, port, guarded: true };
}

/** Reject non-public ranges, including IPv4 embedded in IPv6 mapped addresses. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (family !== 6 || ip.includes('%')) return false;
  let hex = ip.toLowerCase();
  if (hex.includes('.')) {
    const split = hex.lastIndexOf(':');
    const bytes = hex
      .slice(split + 1)
      .split('.')
      .map(Number);
    hex =
      hex.slice(0, split + 1) +
      ((bytes[0] << 8) | bytes[1]).toString(16) +
      ':' +
      ((bytes[2] << 8) | bytes[3]).toString(16);
  }
  const halves = hex.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const words = (
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
      : left
  ).map((w) => parseInt(w, 16));
  if (words.slice(0, 5).every((w) => w === 0) && words[5] === 0xffff) {
    return isPublicAddress(
      [words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255].join('.')
    );
  }
  if (words.slice(0, 7).every((w) => w === 0) && words[7] <= 1) return false;
  return !(
    (words[0] & 0xfe00) === 0xfc00 ||
    (words[0] & 0xffc0) === 0xfe80 ||
    (words[0] & 0xff00) === 0xff00
  );
}
