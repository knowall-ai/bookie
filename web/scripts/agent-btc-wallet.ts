/**
 * Source of agent/hermes/scripts/btc-wallet.mjs: the Bookie agent's read-only Bitcoin
 * wallet lookup. It reuses the portal's own wallet code (src/lib/bitcoin) and is bundled
 * for Node, because the agent's VM has Node but not Bun or the web app's packages:
 *
 *   cd web && bun run build:agent-btc
 *
 * What it does (all read-only):
 *   list                         wallets: BC bank accounts with a Bitcoin descriptor
 *   show <wallet> [--limit N] [--gbp]
 *                                balance, pending, transactions (and Kraken GBP with --gbp)
 *   reconcile [<wallet>]         the same reconcile summary as the portal
 *   options: --company "<BC company name>" (default BC_COMPANY)
 *
 * <wallet> is the bank account number or name. Output is JSON. It never prints a
 * descriptor, an xpub or an address. Business Central is read with the agent's existing
 * service-to-service app (BC_TENANT_ID, BC_CLIENT_ID, BC_CLIENT_SECRET, BC_ENVIRONMENT;
 * it needs BOOKIE BTC READ, and BOOKIE READ for reconcile); the chain with an Electrum
 * server over TLS (BOOKIE_ELECTRUM_URL, certificate verified; BOOKIE_ELECTRUM_CERT_SHA256
 * pins a self-signed one). Settings come from the environment or ~/.hermes/.env.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describeWallet, parseWalletInput, type ScriptType } from '../src/lib/bitcoin/descriptor';
import { ElectrumClient, parseElectrumUrl } from '../src/lib/bitcoin/electrum';
import { satsToBtc } from '../src/lib/bitcoin/format';
import { gbpFor, latestRate, ratesForBlockTimes } from '../src/lib/bitcoin/kraken';
import { draftedTxids, reconcile, summariseReconcile, txDate } from '../src/lib/bitcoin/reconcile';
import { scanWallet } from '../src/lib/bitcoin/scan';

const BC = 'https://api.businesscentral.dynamics.com';
const LEDGER_API = 'knowallBookie/bookie/v1.0';
const BITCOIN_API = 'bookie/bitcoin/v1.0';

class Refusal extends Error {}

function loadEnv() {
  const file = join(homedir(), '.hermes', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function need(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Refusal(`${name} is not set (in the environment or ~/.hermes/.env).`);
  return value;
}

const btc = (sats: number) => Number(satsToBtc(sats).replace(/,/g, ''));

/* ------------------------------------------------------------------ */
/* Business Central, as the agent's app (client credentials)           */
/* ------------------------------------------------------------------ */

async function bcToken(): Promise<string> {
  const tenant = need('BC_TENANT_ID');
  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: need('BC_CLIENT_ID'),
      client_secret: need('BC_CLIENT_SECRET'),
      scope: `${BC}/.default`,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) throw new Refusal('Business Central sign-in failed.');
  return body.access_token;
}

function bcApi(token: string) {
  const root = `${BC}/v2.0/${need('BC_TENANT_ID')}/${encodeURIComponent(need('BC_ENVIRONMENT'))}/api`;
  const get = async <T>(url: string): Promise<T> => {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      const error = new Refusal(`Business Central returned ${response.status}.`);
      (error as Refusal & { status?: number }).status = response.status;
      throw error;
    }
    return (await response.json()) as T;
  };
  const all = async <T>(url: string): Promise<T[]> => {
    const rows: T[] = [];
    let next: string | undefined = url;
    for (let page = 0; next && page < 20; page++) {
      const body: { value: T[]; '@odata.nextLink'?: string } = await get(next);
      rows.push(...body.value);
      next = body['@odata.nextLink'];
    }
    return rows;
  };
  return { root, get, all };
}

interface BcWallet {
  id: string;
  number: string;
  displayName?: string;
  currencyCode?: string;
  bitcoinWalletDescriptor?: string;
  bitcoinScriptType?: string;
}

const SCRIPT_TYPES: Record<string, ScriptType> = {
  WPKH: 'wpkh',
  SHWPKH: 'sh-wpkh',
  TR: 'tr',
  WSHMulti: 'wsh-multi',
  PKH: 'pkh',
};

async function openCompany(companyName: string) {
  const api = bcApi(await bcToken());
  const companies = await api.all<{ id: string; name: string; displayName?: string }>(
    `${api.root}/v2.0/companies?$select=id,name,displayName`
  );
  const company = companies.find((c) => c.name === companyName || c.displayName === companyName);
  if (!company) throw new Refusal(`No Business Central company called "${companyName}".`);
  const url = (route: string, path: string) =>
    `${api.root}/${route}/companies(${company.id})/${path}`;
  return { api, url, company: company.displayName || company.name };
}

async function bcWallets(companyName: string) {
  const bc = await openCompany(companyName);
  try {
    const rows = await bc.api.all<BcWallet>(bc.url(BITCOIN_API, 'bitcoinWallets'));
    return { bc, rows: rows.filter((r) => r.bitcoinWalletDescriptor?.trim()) };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      throw new Refusal(
        'The Bookie Bitcoin extension is not installed in this Business Central environment.'
      );
    }
    if (status === 403) {
      throw new Refusal('My Business Central app has no BOOKIE BTC READ permission set.');
    }
    throw error;
  }
}

function describe(row: BcWallet) {
  try {
    const parsed = parseWalletInput(
      row.bitcoinWalletDescriptor ?? '',
      SCRIPT_TYPES[row.bitcoinScriptType ?? '']
    );
    return { parsed, summary: { type: describeWallet(parsed), network: parsed.network } };
  } catch (error) {
    return { summary: { problem: `The descriptor can't be used: ${(error as Error).message}` } };
  }
}

function pick(rows: BcWallet[], wanted: string | undefined) {
  if (!wanted) return rows;
  const w = wanted.toLowerCase();
  const hit = rows.filter(
    (r) => r.number.toLowerCase() === w || (r.displayName ?? '').toLowerCase() === w
  );
  if (hit.length === 0) throw new Refusal(`No Bitcoin wallet "${wanted}" in this company.`);
  return hit;
}

/* ------------------------------------------------------------------ */
/* The chain                                                           */
/* ------------------------------------------------------------------ */

async function scan(row: BcWallet) {
  const { parsed, summary } = describe(row);
  if (!parsed) throw new Refusal('problem' in summary ? summary.problem : 'Unusable descriptor.');
  if (parsed.network !== 'mainnet') throw new Refusal('This is a testnet wallet.');
  const server = parseElectrumUrl(need('BOOKIE_ELECTRUM_URL'));
  if (server.protocol !== 'ssl') {
    throw new Refusal('BOOKIE_ELECTRUM_URL must be ssl://host:port: I only use TLS.');
  }
  const client = await ElectrumClient.connect(server, {
    certSha256: process.env.BOOKIE_ELECTRUM_CERT_SHA256?.trim() || undefined,
  });
  try {
    return await scanWallet(parsed, client);
  } finally {
    client.close();
  }
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

async function list(company: string) {
  const { bc, rows } = await bcWallets(company);
  return {
    company: bc.company,
    wallets: rows.map((r) => ({
      bankAccount: r.number,
      name: r.displayName,
      currency: r.currencyCode || 'the company’s local currency',
      ...describe(r).summary,
    })),
  };
}

async function show(company: string, wanted: string, limit: number, gbp: boolean) {
  const { rows } = await bcWallets(company);
  const [row] = pick(rows, wanted);
  const result = await scan(row);
  const shown = result.transactions.slice(0, limit);
  const times = shown.flatMap((t) => (t.blockTime ? [t.blockTime] : []));
  const rates = gbp ? await ratesForBlockTimes(times) : undefined;
  const balanceRate = gbp ? await latestRate().catch(() => undefined) : undefined;
  return {
    wallet: row.displayName,
    bankAccount: row.number,
    readAtBlock: result.tip.height,
    balance: {
      confirmedBtc: btc(result.balance.confirmedSats),
      pendingBtc: btc(result.balance.pendingSats),
      ...(gbp
        ? {
            confirmedGbp: balanceRate
              ? gbpFor(result.balance.confirmedSats, balanceRate)
              : { ok: false, reason: 'Kraken prices are unavailable.' },
          }
        : {}),
    },
    transactions: shown.map((t) => {
      const rate = t.blockTime ? rates?.get(t.blockTime) : undefined;
      return {
        txid: t.txid,
        date: txDate(t),
        status: t.pending ? 'pending (unconfirmed, not settled)' : 'confirmed',
        confirmations: t.confirmations,
        amountBtc: btc(t.netSats),
        feeBtc: t.feeSats === undefined ? 'not available' : btc(t.feeSats),
        ...(gbp
          ? {
              gbp: !t.blockTime
                ? { ok: false, reason: 'Pending: no block time, so no rate.' }
                : typeof rate === 'object'
                  ? gbpFor(t.netSats, rate)
                  : { ok: false, reason: rate ?? 'Kraken prices are unavailable.' },
            }
          : {}),
      };
    }),
    more: result.transactions.length > limit ? result.transactions.length - limit : 0,
  };
}

async function reconcileWallets(company: string, wanted: string | undefined) {
  const { bc, rows } = await bcWallets(company);
  const journals = await bc.api
    .all<{ id: string; code: string }>(bc.url('v2.0', 'journals?$select=id,code'))
    .catch(() => []);
  const btcBatches = journals.filter((j) => j.code.startsWith('BTC'));
  const results = [];
  for (const row of pick(rows, wanted)) {
    try {
      if (row.currencyCode !== 'BTC') {
        throw new Refusal(`Bank account ${row.number} is not in BTC, so it can't be reconciled.`);
      }
      const chain = await scan(row);
      const filter = encodeURIComponent(`bankAccountNumber eq '${row.number.replace(/'/g, "''")}'`);
      const ledger = (
        await bc.api
          .all<{
            id: string;
            entryNumber: number;
            postingDate: string;
            documentNumber?: string;
            externalDocumentNumber?: string;
            description?: string;
            amount: number;
            reversed?: boolean;
          }>(bc.url(LEDGER_API, `bankAccountLedgerEntries?$filter=${filter}`))
          .catch((error) => {
            if ((error as { status?: number }).status === 404) {
              throw new Refusal('Reconciling needs the Bookie BC API extension as well.');
            }
            throw error;
          })
      )
        .filter((e) => !e.reversed)
        .map((e) => ({
          id: e.id,
          entryNumber: e.entryNumber,
          postingDate: e.postingDate.slice(0, 10),
          documentNumber: e.documentNumber || undefined,
          externalDocumentNumber: e.externalDocumentNumber || undefined,
          description: e.description || undefined,
          amountSats: Math.round(e.amount * 1e8),
        }));
      const draftLines = (
        await Promise.all(
          btcBatches.map((b) =>
            bc.api
              .all<{ accountNumber?: string; externalDocumentNumber?: string }>(
                bc.url('v2.0', `journals(${b.id})/journalLines`)
              )
              .catch(() => [])
          )
        )
      )
        .flat()
        .filter((l) => l.accountNumber === row.number)
        .map((l) => ({ externalDocumentNumber: l.externalDocumentNumber ?? '' }));
      const txids = chain.transactions.map((t) => t.txid);
      results.push(
        summariseReconcile({
          wallet: row.displayName ?? row.number,
          bankAccountNumber: row.number,
          scan: chain,
          result: reconcile(chain.transactions, ledger),
          ledgerSats: ledger.reduce((s, e) => s + e.amountSats, 0),
          drafted: [
            ...draftedTxids(
              draftLines.map((l) => ({
                bankAccountNumber: row.number,
                postingDate: '',
                documentNumber: '',
                externalDocumentNumber: l.externalDocumentNumber,
                description: '',
                amountSats: 0,
                balancingAccountNumber: '',
              })),
              txids
            ),
          ],
        })
      );
    } catch (error) {
      results.push({
        wallet: row.displayName ?? row.number,
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'The reconcile failed.',
      });
    }
  }
  return { company: bc.company, wallets: results };
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i !== -1) args.splice(i, 1);
    return i !== -1;
  };
  const company = option('--company') ?? need('BC_COMPANY');
  const limit = Math.min(500, Math.max(1, Number(option('--limit') ?? 50) || 50));
  const gbp = flag('--gbp');
  const [command, wallet] = args;
  let output: unknown;
  if (command === 'list') output = await list(company);
  else if (command === 'show' && wallet) output = await show(company, wallet, limit, gbp);
  else if (command === 'reconcile') output = await reconcileWallets(company, wallet);
  else {
    throw new Refusal(
      'Usage: btc-wallet.mjs list | show <wallet> [--limit N] [--gbp] | reconcile [<wallet>]  [--company "<name>"]'
    );
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Failed.';
  process.stdout.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
});
