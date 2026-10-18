import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { electrumScriptHash, parseWalletInput, scriptDeriver } from './descriptor';
import { ElectrumClient, ElectrumError, parseElectrumUrl } from './electrum';
import { MAX_TRANSACTIONS, headerTime, scanWallet } from './scan';
import { btcToSats, formatBtc, satsToBtc, satsToBtcNumber, shortTxid } from './format';

/*
 * A fake Electrum server on localhost, answering from fixtures built here. The
 * wallet is the public BIP84 test vector; every transaction is made up for the test.
 */

const ZPUB =
  'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs';
const wallet = parseWalletInput(ZPUB);
const derive = scriptDeriver(wallet);
const FOREIGN_SCRIPT = '0014' + '11'.repeat(20);

function rawTx(
  inputs: { txid: string; index: number }[],
  outputs: { script: string; sats: number }[]
) {
  const bytes = btc.RawTx.encode({
    version: 2,
    segwitFlag: false,
    inputs: inputs.map((i) => ({
      txid: hex.decode(i.txid),
      index: i.index,
      finalScriptSig: new Uint8Array(),
      sequence: 0xffffffff,
    })),
    outputs: outputs.map((o) => ({ amount: BigInt(o.sats), script: hex.decode(o.script) })),
    witnesses: [],
    lockTime: 0,
  });
  const txHex = hex.encode(bytes);
  const id = btc.Transaction.fromRaw(bytes, {
    allowUnknownOutputs: true,
    disableScriptCheck: true,
  }).id;
  return { id, hex: txHex };
}

function header(time: number) {
  const bytes = new Uint8Array(80);
  new DataView(bytes.buffer).setUint32(68, time, true);
  return hex.encode(bytes);
}

const recv0 = derive('receive', 0).script;
const recv1 = derive('receive', 1).script;
const change0 = derive('change', 0).script;

const outsider = rawTx(
  [{ txid: 'aa'.repeat(32), index: 0 }],
  [{ script: FOREIGN_SCRIPT, sats: 250_000 }]
);
// Someone pays the wallet 100,000 sats.
const funding = rawTx(
  [{ txid: outsider.id, index: 0 }],
  [
    { script: recv0, sats: 100_000 },
    { script: FOREIGN_SCRIPT, sats: 149_000 },
  ]
);
// The wallet pays 60,000 out, 39,000 back to change: 1,000 fee.
const spend = rawTx(
  [{ txid: funding.id, index: 0 }],
  [
    { script: FOREIGN_SCRIPT, sats: 60_000 },
    { script: change0, sats: 39_000 },
  ]
);
// An unconfirmed payment in.
const pending = rawTx([{ txid: 'bb'.repeat(32), index: 1 }], [{ script: recv1, sats: 5_000 }]);

const TXS = new Map([outsider, funding, spend, pending].map((t) => [t.id, t.hex]));
const HISTORY = new Map<string, { tx_hash: string; height: number }[]>([
  [
    electrumScriptHash(recv0),
    [
      { tx_hash: funding.id, height: 100 },
      { tx_hash: spend.id, height: 105 },
    ],
  ],
  [electrumScriptHash(recv1), [{ tx_hash: pending.id, height: 0 }]],
  [electrumScriptHash(change0), [{ tx_hash: spend.id, height: 105 }]],
]);
const BALANCES = new Map([
  [electrumScriptHash(recv0), { confirmed: 0, unconfirmed: 0 }],
  [electrumScriptHash(recv1), { confirmed: 0, unconfirmed: 5_000 }],
  [electrumScriptHash(change0), { confirmed: 39_000, unconfirmed: 0 }],
]);

type Handler = (method: string, params: unknown[]) => unknown;

const fixtureHandler: Handler = (method, params) => {
  switch (method) {
    case 'server.version':
      return ['FakeElectrum 1.0', '1.4'];
    case 'blockchain.headers.subscribe':
      return { height: 110, hex: header(1_790_000_000) };
    case 'blockchain.block.header':
      return header(1_789_000_000 + Number(params[0]) * 600);
    case 'blockchain.scripthash.get_history':
      return HISTORY.get(String(params[0])) ?? [];
    case 'blockchain.scripthash.get_balance':
      return BALANCES.get(String(params[0])) ?? { confirmed: 0, unconfirmed: 0 };
    case 'blockchain.transaction.get': {
      const tx = TXS.get(String(params[0]));
      if (!tx) throw new Error('No such transaction');
      return tx;
    }
    default:
      throw new Error(`Unknown method ${method}`);
  }
};

const servers: net.Server[] = [];
const methodsSeen: string[] = [];

async function fakeServer(handler: Handler, options: { silent?: string[] } = {}) {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const { id, method, params } = JSON.parse(line);
        methodsSeen.push(method);
        if (options.silent?.includes(method)) continue;
        try {
          socket.write(
            `${JSON.stringify({ jsonrpc: '2.0', id, result: handler(method, params) })}\n`
          );
        } catch (error) {
          socket.write(
            `${JSON.stringify({ jsonrpc: '2.0', id, error: { code: 1, message: (error as Error).message } })}\n`
          );
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return parseElectrumUrl(`tcp://127.0.0.1:${port}`);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  methodsSeen.length = 0;
});

describe('parseElectrumUrl', () => {
  it('accepts ssl and tcp', () => {
    expect(parseElectrumUrl('ssl://electrum.example.com:50002')).toEqual({
      protocol: 'ssl',
      host: 'electrum.example.com',
      port: 50002,
    });
    expect(parseElectrumUrl('tcp://[::1]:50001').host).toBe('::1');
  });

  it('refuses anything else', () => {
    expect(() => parseElectrumUrl('https://electrum.example.com')).toThrow(ElectrumError);
    expect(() => parseElectrumUrl('ssl://host:99999')).toThrow(ElectrumError);
    expect(() => parseElectrumUrl('ssl://host')).toThrow(ElectrumError);
  });
});

describe('ElectrumClient', () => {
  it('speaks line-delimited JSON-RPC, starting with server.version', async () => {
    const client = await ElectrumClient.connect(await fakeServer(fixtureHandler));
    const tip = await client.request<{ height: number }>('blockchain.headers.subscribe');
    expect(tip.height).toBe(110);
    expect(methodsSeen[0]).toBe('server.version');
    client.close();
  });

  it('turns server errors into ElectrumError', async () => {
    const client = await ElectrumClient.connect(await fakeServer(fixtureHandler));
    const error = await client
      .request('blockchain.transaction.get', ['cc'.repeat(32)])
      .catch((e: ElectrumError) => e);
    expect(error).toBeInstanceOf(ElectrumError);
    // A fixed message for the browser; the server's text stays in `detail` for logs.
    expect((error as ElectrumError).message).toBe('The Electrum server returned an error.');
    expect((error as ElectrumError).detail).toMatch(/No such transaction/);
    client.close();
  });

  it('times out a request the server never answers', async () => {
    const client = await ElectrumClient.connect(
      await fakeServer(fixtureHandler, { silent: ['blockchain.block.header'] }),
      { timeoutMs: 100 }
    );
    await expect(client.request('blockchain.block.header', [1])).rejects.toThrow(/in time/);
    client.close();
  });

  it('caps requests in flight and still answers all of them', async () => {
    const client = await ElectrumClient.connect(await fakeServer(fixtureHandler), {
      maxInFlight: 2,
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        client.request<string>('blockchain.block.header', [i + 1])
      )
    );
    expect(results.map(headerTime)).toEqual(
      Array.from({ length: 10 }, (_, i) => 1_789_000_000 + (i + 1) * 600)
    );
    client.close();
  });

  it('fails cleanly when nothing is listening', async () => {
    const server = await fakeServer(fixtureHandler);
    await new Promise((r) => servers.pop()!.close(r));
    const error = (await ElectrumClient.connect(server, { connectTimeoutMs: 500 }).catch(
      (e: unknown) => e
    )) as ElectrumError;
    expect(error).toBeInstanceOf(ElectrumError);
    // Never the host or port in what the browser may see.
    expect(error.message).toBe('The Electrum server refused the connection.');
    expect(error.message).not.toContain(String(server.port));
    expect(error.message).not.toContain('127.0.0.1');
  });

  it('closes the socket when the version handshake fails', async () => {
    const server = await fakeServer((method, params) => {
      if (method === 'server.version') throw new Error('unsupported protocol version');
      return fixtureHandler(method, params);
    });
    await expect(ElectrumClient.connect(server)).rejects.toThrow(
      'The Electrum server returned an error.'
    );
  });
});

describe('scanWallet', () => {
  it('reads history, balance, fees and pending transactions', async () => {
    const client = await ElectrumClient.connect(await fakeServer(fixtureHandler));
    const scan = await scanWallet(wallet, client, { now: () => new Date('2026-10-18T00:00:00Z') });
    client.close();

    expect(scan.tip.height).toBe(110);
    expect(scan.balance).toEqual({ confirmedSats: 39_000, pendingSats: 5_000 });
    expect(scan.used).toEqual({ receive: 2, change: 1 });
    // Gap limit 20 after the last used address on each chain.
    expect(scan.derived).toEqual({ receive: 22, change: 21 });

    const [first, second, third] = scan.transactions;
    expect(first).toMatchObject({
      txid: pending.id,
      pending: true,
      confirmations: 0,
      netSats: 5_000,
      direction: 'in',
    });
    expect(first.blockTime).toBeUndefined();
    expect(first.height).toBeUndefined();

    expect(second).toMatchObject({
      txid: spend.id,
      height: 105,
      confirmations: 6,
      receivedSats: 39_000,
      sentSats: 100_000,
      netSats: -61_000,
      feeSats: 1_000,
      direction: 'out',
      blockTime: 1_789_000_000 + 105 * 600,
    });

    expect(third).toMatchObject({
      txid: funding.id,
      netSats: 100_000,
      direction: 'in',
      confirmations: 11,
    });
    // The sender paid that fee, so it isn't the wallet's.
    expect(third.feeSats).toBeUndefined();
  });

  it('scans only the receive chain for a single-chain descriptor', async () => {
    const single = parseWalletInput(`wpkh(${wallet.keys[0].xpub}/0/*)`);
    const client = await ElectrumClient.connect(await fakeServer(fixtureHandler));
    const scan = await scanWallet(single, client);
    client.close();
    expect(scan.derived.change).toBe(0);
    expect(scan.transactions.map((t) => t.txid)).toContain(funding.id);
  });

  it('reports no fee when others funded part of the transaction', async () => {
    // The wallet's 100,000-sat output and someone else's 250,000 fund one payment.
    const joint = rawTx(
      [
        { txid: funding.id, index: 0 },
        { txid: outsider.id, index: 0 },
      ],
      [{ script: FOREIGN_SCRIPT, sats: 349_000 }]
    );
    const txs = new Map([...TXS, [joint.id, joint.hex]]);
    const handler: Handler = (method, params) => {
      if (method === 'blockchain.scripthash.get_history') {
        return params[0] === electrumScriptHash(recv0)
          ? [
              { tx_hash: funding.id, height: 100 },
              { tx_hash: joint.id, height: 106 },
            ]
          : [];
      }
      if (method === 'blockchain.transaction.get') return txs.get(String(params[0]));
      return fixtureHandler(method, params);
    };
    const client = await ElectrumClient.connect(await fakeServer(handler));
    const scan = await scanWallet(wallet, client);
    client.close();
    const tx = scan.transactions.find((t) => t.txid === joint.id)!;
    expect(tx).toMatchObject({ sentSats: 100_000, netSats: -100_000, sharedInputs: true });
    expect(tx.feeSats).toBeUndefined();
    // Bookie no longer fetches other people's transactions to price a fee.
    expect(methodsSeen.filter((m) => m === 'blockchain.transaction.get')).toHaveLength(2);
  });

  it('stops rather than read an enormous history', async () => {
    const many = Array.from({ length: MAX_TRANSACTIONS + 1 }, (_, i) => ({
      tx_hash: i.toString(16).padStart(64, '0'),
      height: 100,
    }));
    const client = await ElectrumClient.connect(
      await fakeServer((method, params) =>
        method === 'blockchain.scripthash.get_history'
          ? params[0] === electrumScriptHash(recv0)
            ? many
            : []
          : fixtureHandler(method, params)
      )
    );
    await expect(scanWallet(wallet, client)).rejects.toThrow(/more than Bookie reads live/);
    client.close();
  });

  it('sees an empty wallet as empty', async () => {
    const client = await ElectrumClient.connect(
      await fakeServer((method, params) =>
        method === 'blockchain.scripthash.get_history' ? [] : fixtureHandler(method, params)
      )
    );
    const scan = await scanWallet(wallet, client);
    client.close();
    expect(scan.transactions).toEqual([]);
    expect(scan.balance).toEqual({ confirmedSats: 0, pendingSats: 0 });
    expect(scan.derived).toEqual({ receive: 20, change: 20 });
  });
});

describe('amount helpers', () => {
  it('formats satoshis as BTC with 8 decimals', () => {
    expect(satsToBtc(150_000)).toBe('0.00150000');
    expect(satsToBtc(-61_000)).toBe('-0.00061000');
    expect(satsToBtc(2_100_000_000_000_000)).toBe('21,000,000.00000000');
    expect(formatBtc(-61_000)).toBe('−0.00061000 BTC');
    expect(formatBtc(150_000, { sign: true })).toBe('+0.00150000 BTC');
    expect(shortTxid('ab'.repeat(32))).toBe('ababababab…ababab');
  });

  it('round-trips satoshis through BC decimals', () => {
    expect(satsToBtcNumber(-3_001_500)).toBe(-0.030015);
    expect(btcToSats(satsToBtcNumber(123_456_789))).toBe(123_456_789);
  });

  it('converts BC decimals to satoshis exactly', () => {
    expect(btcToSats(0.00061)).toBe(61_000);
    expect(btcToSats(-0.1)).toBe(-10_000_000);
    expect(btcToSats(0.29)).toBe(29_000_000);
  });
});
