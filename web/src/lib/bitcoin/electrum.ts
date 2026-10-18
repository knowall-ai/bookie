import { createHash } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';

/**
 * A small Electrum protocol client (JSON-RPC 2.0, one JSON object per line) over
 * TLS (`ssl://host:port`) or plain TCP (`tcp://host:port`). Requests are pipelined
 * on one connection with a cap on how many are in flight.
 *
 * Bookie only reads: `server.version`, `blockchain.headers.subscribe`,
 * `blockchain.block.header`, `blockchain.scripthash.get_history`,
 * `blockchain.scripthash.get_balance` and `blockchain.transaction.get`.
 */

export interface ElectrumServer {
  protocol: 'ssl' | 'tcp';
  host: string;
  port: number;
}

export class ElectrumError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElectrumError';
  }
}

/** `ssl://host:port` or `tcp://host:port`. */
export function parseElectrumUrl(url: string): ElectrumServer {
  const match = /^(ssl|tcp):\/\/(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):(\d{1,5})\/?$/.exec(url.trim());
  if (!match) {
    throw new ElectrumError(
      'BOOKIE_ELECTRUM_URL must look like ssl://host:port or tcp://host:port.'
    );
  }
  const port = Number(match[3]);
  if (port < 1 || port > 65535) throw new ElectrumError('The Electrum port is out of range.');
  return {
    protocol: match[1] as 'ssl' | 'tcp',
    host: match[2].replace(/^\[|\]$/g, ''),
    port,
  };
}

export interface ElectrumApi {
  request<T>(method: string, params?: unknown[]): Promise<T>;
}

export interface ElectrumOptions {
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Connection timeout. */
  connectTimeoutMs?: number;
  /** Requests in flight at once. */
  maxInFlight?: number;
  /**
   * SHA-256 fingerprint of the server's TLS certificate (hex, colons optional).
   * When set, the certificate is pinned instead of checked against public CAs,
   * for a self-hosted server with a self-signed certificate.
   */
  certSha256?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ElectrumClient implements ElectrumApi {
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, Pending>();
  private readonly queue: (() => void)[] = [];
  private inFlight = 0;
  private closed?: Error;

  private constructor(
    private readonly socket: net.Socket,
    private readonly options: Required<Omit<ElectrumOptions, 'certSha256'>>
  ) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => this.onData(chunk));
    socket.on('error', (error) =>
      this.fail(new ElectrumError(`Electrum connection error: ${error.message}`))
    );
    socket.on('close', () =>
      this.fail(new ElectrumError('The Electrum server closed the connection.'))
    );
  }

  static async connect(
    server: ElectrumServer,
    options: ElectrumOptions = {}
  ): Promise<ElectrumClient> {
    const settings = {
      timeoutMs: options.timeoutMs ?? 20_000,
      connectTimeoutMs: options.connectTimeoutMs ?? 10_000,
      maxInFlight: options.maxInFlight ?? 40,
    };
    const pin = options.certSha256?.replace(/:/g, '').toLowerCase();
    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const timer = setTimeout(() => {
        s.destroy();
        reject(new ElectrumError('Timed out connecting to the Electrum server.'));
      }, settings.connectTimeoutMs);
      const done = (error?: Error) => {
        clearTimeout(timer);
        if (error) {
          s.destroy();
          reject(new ElectrumError(`Could not connect to the Electrum server: ${error.message}`));
        } else resolve(s);
      };
      const s: net.Socket =
        server.protocol === 'ssl'
          ? tls.connect({
              host: server.host,
              port: server.port,
              servername: net.isIP(server.host) ? undefined : server.host,
              // With a pinned certificate, the fingerprint check below replaces CA validation.
              rejectUnauthorized: !pin,
            })
          : net.connect({ host: server.host, port: server.port });
      s.once(server.protocol === 'ssl' ? 'secureConnect' : 'connect', () => {
        if (pin && s instanceof tls.TLSSocket) {
          const cert = s.getPeerCertificate();
          const fingerprint = cert?.raw ? createHash('sha256').update(cert.raw).digest('hex') : '';
          if (fingerprint !== pin) {
            done(new Error('the TLS certificate does not match BOOKIE_ELECTRUM_CERT_SHA256'));
            return;
          }
        }
        done();
      });
      s.once('error', (error) => done(error));
    });
    const client = new ElectrumClient(socket, settings);
    await client.request('server.version', ['Bookie', '1.4']);
    return client;
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length > 64 * 1024 * 1024) {
      this.fail(new ElectrumError('The Electrum server sent an oversized response.'));
      return;
    }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onMessage(line);
    }
  }

  private onMessage(line: string) {
    let message: { id?: number; result?: unknown; error?: { message?: string } | string };
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    // Notifications (no id) are ignored: Bookie doesn't subscribe to anything.
    if (typeof message.id !== 'number') return;
    const entry = this.pending.get(message.id);
    if (!entry) return;
    this.pending.delete(message.id);
    clearTimeout(entry.timer);
    this.release();
    if (message.error) {
      const text = typeof message.error === 'string' ? message.error : message.error.message;
      entry.reject(new ElectrumError(`Electrum server error: ${text ?? 'unknown error'}`));
    } else entry.resolve(message.result);
  }

  private release() {
    this.inFlight--;
    this.queue.shift()?.();
  }

  private fail(error: Error) {
    if (this.closed) return;
    this.closed = error;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    this.queue.length = 0;
    this.socket.destroy();
  }

  request<T>(method: string, params: unknown[] = []): Promise<T> {
    if (this.closed) return Promise.reject(this.closed);
    return new Promise<T>((resolve, reject) => {
      const send = () => {
        if (this.closed) {
          reject(this.closed);
          return;
        }
        this.inFlight++;
        const id = this.nextId++;
        const timer = setTimeout(() => {
          if (!this.pending.delete(id)) return;
          this.release();
          reject(new ElectrumError(`The Electrum server did not answer ${method} in time.`));
        }, this.options.timeoutMs);
        this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        this.socket.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      };
      if (this.inFlight < this.options.maxInFlight) send();
      else this.queue.push(send);
    });
  }

  close() {
    this.fail(new ElectrumError('Connection closed.'));
  }
}
