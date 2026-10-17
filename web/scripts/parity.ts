/**
 * Parity check: do Bookie's numbers equal the source system's?
 *
 * For each live organisation it runs Bookie's connector and, independently,
 * the raw Xero / Business Central API, and compares totals and counts. It
 * prints PASS / FAIL per check with differences as percentages only: never
 * amounts, names or ids, so the output is safe to paste into a PR.
 *
 *   PARITY_TENANT_ID=<entra tenant> PARITY_BC_COMPANIES="Production:<companyId>,..." \
 *     bun run parity
 *
 * - Xero: Custom Connection keys from ~/.config/xero/credentials
 *   (XERO_CLIENT_ID / XERO_CLIENT_SECRET); every organisation they reach is checked.
 * - BC: a token from the Azure CLI (`az account get-access-token`).
 * - `SMOKE_TENANT_ID` / `SMOKE_BC_COMPANIES` are accepted as fallbacks. Set
 *   PARITY_SKIP_XERO=1 or leave PARITY_BC_COMPANIES empty to skip a back end.
 *
 * Exits non-zero if any check fails.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { BcClient } from '../src/lib/connectors/bc/client';
import { createBcConnector } from '../src/lib/connectors/bc';
import { bcFiscalYear } from '../src/lib/connectors/bc/fiscal-year';
import { XeroClient, discoverXeroTenants } from '../src/lib/connectors/xero/client';
import { createXeroConnector } from '../src/lib/connectors/xero';
import {
  findReportValue,
  fromXeroReport,
  type XeroReport,
} from '../src/lib/connectors/xero/reports';
import type { AccountingConnector } from '../src/lib/connectors/types';
import type { XeroConnection } from '../src/lib/config/types';
import type { InvoiceStatus, InvoiceType, Report } from '../src/lib/domain/types';
import { financialYear } from '../src/lib/reports/periods';

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

let failures = 0;
let checks = 0;

/** Relative difference as a percentage of the larger magnitude (0 when both are 0). */
function diffPercent(a: number, b: number): number {
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale === 0 ? 0 : (Math.abs(a - b) / scale) * 100;
}

function check(
  label: string,
  bookie: number | undefined,
  source: number | undefined,
  tolerance = 0.01
) {
  checks++;
  if (
    bookie === undefined ||
    source === undefined ||
    Number.isNaN(bookie) ||
    Number.isNaN(source)
  ) {
    failures++;
    console.log(`  FAIL  ${label}: ${bookie === undefined ? 'Bookie' : 'source'} value missing`);
    return;
  }
  const ok = Math.abs(bookie - source) <= tolerance;
  if (!ok) failures++;
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` (differs by ${diffPercent(bookie, source).toFixed(2)}%)`}`
  );
}

function note(text: string) {
  console.log(`  NOTE  ${text}`);
}

async function guard(label: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    checks++;
    failures++;
    const status = (error as { status?: number }).status;
    console.log(`  FAIL  ${label}: error${status ? ` ${status}` : ''} (${(error as Error).name})`);
  }
}

const sum = (values: number[]) => Math.round(values.reduce((s, n) => s + n, 0) * 100) / 100;
const today = () => new Date().toISOString().slice(0, 10);
const value = (report: Report, label: RegExp, column = 1) => findReportValue(report, label, column);

/** Page through a connector list with big pages. */
async function countAndSum(
  connector: AccountingConnector,
  type: InvoiceType,
  status: InvoiceStatus
): Promise<{ count: number; total: number; due: number }> {
  let count = 0;
  let total = 0;
  let due = 0;
  for (let page = 1; page <= 100; page++) {
    const result = await connector.invoices!.list(type, { status, page, pageSize: 500 });
    count += result.items.length;
    total += sum(result.items.map((i) => i.total));
    due += sum(result.items.flatMap((i) => (i.amountDue === undefined ? [] : [i.amountDue])));
    if (!result.hasMore || result.items.length === 0) break;
  }
  return { count, total: Math.round(total * 100) / 100, due: Math.round(due * 100) / 100 };
}

/* ------------------------------------------------------------------ */
/* Xero                                                                */
/* ------------------------------------------------------------------ */

interface RawXeroInvoice {
  Status: string;
  Total?: number;
  AmountDue?: number;
  CurrencyCode?: string;
  CurrencyRate?: number;
}

async function xeroParity(tenantId: string) {
  const creds = Object.fromEntries(
    readFileSync(`${homedir()}/.config/xero/credentials`, 'utf8')
      .split('\n')
      .filter((l) => l.includes('='))
      .map((l) => {
        const at = l.indexOf('=');
        return [
          l.slice(0, at).trim(),
          l
            .slice(at + 1)
            .trim()
            .replace(/^"|"$/g, ''),
        ] as const;
      })
  );
  const connection: XeroConnection = {
    id: 'parity',
    kind: 'xero',
    label: 'parity',
    auth: {
      type: 'custom-connection',
      clientId: creds.XERO_CLIENT_ID,
      clientSecret: creds.XERO_CLIENT_SECRET,
    },
    orgs: [],
    createdBy: 'parity',
    createdAt: '',
    updatedAt: '',
  };
  const tenants = await discoverXeroTenants(connection, tenantId);
  for (const [n, tenant] of tenants.entries()) {
    const client = new XeroClient({
      ownerTenantId: tenantId,
      connection,
      xeroTenantId: tenant.tenantId,
    });
    const connector = createXeroConnector({
      org: { key: 'parity', kind: 'xero', name: 'Xero org', sourceLabel: 'Xero' },
      client,
    });
    console.log(`\n== Xero organisation ${n + 1} of ${tenants.length}`);

    const raw = <T>(path: string, query?: Record<string, string | number | boolean>) =>
      client.request<T>(path, { query });
    const rawReport = async (name: string, id: Report['id'], query: Record<string, string>) =>
      fromXeroReport(
        id,
        (await raw<{ Reports: XeroReport[] }>(`Reports/${name}`, query)).Reports[0]
      );
    const rawInvoices = async (type: 'ACCREC' | 'ACCPAY', status: string) => {
      const all: RawXeroInvoice[] = [];
      for (let page = 1; page <= 100; page++) {
        const { Invoices } = await raw<{ Invoices: RawXeroInvoice[] }>('Invoices', {
          where: `Type=="${type}"`,
          Statuses: status,
          summaryOnly: true,
          pageSize: 1000,
          page,
        });
        all.push(...Invoices);
        if (Invoices.length < 1000) break;
      }
      return all;
    };

    const org = await connector.organisation();
    const fy = financialYear(today(), org.financialYearEndDay, org.financialYearEndMonth);
    const ytd = { from: fy.from, to: today() };

    await guard('P&L', async () => {
      const bookie = await connector.reports!.run('profit-and-loss', ytd);
      const source = await rawReport('ProfitAndLoss', 'profit-and-loss', {
        fromDate: ytd.from,
        toDate: ytd.to,
      });
      check(
        'P&L FY to date: total income',
        value(bookie, /^Total (Trading )?Income$/i),
        value(source, /^Total (Trading )?Income$/i)
      );
      check(
        'P&L FY to date: net profit',
        value(bookie, /^Net Profit$/i),
        value(source, /^Net Profit$/i)
      );
      const dashboard = await connector.dashboard();
      check(
        'Home P&L tile: net profit = Xero P&L',
        dashboard.profitAndLoss?.net,
        value(source, /^Net Profit$/i)
      );
    });

    await guard('Balance sheet', async () => {
      const bookie = await connector.reports!.run('balance-sheet', { date: today() });
      const source = await rawReport('BalanceSheet', 'balance-sheet', { date: today() });
      for (const label of [
        /^Total Assets$/,
        /^Total Liabilities$/,
        /^Net Assets$/,
        /^Total Equity$/,
      ]) {
        check(
          `Balance sheet: ${label.source.replace(/[\^$\\]/g, '')}`,
          value(bookie, label),
          value(source, label)
        );
      }
    });

    await guard('Trial balance', async () => {
      const bookie = await connector.reports!.run('trial-balance', { date: today() });
      const source = await rawReport('TrialBalance', 'trial-balance', { date: today() });
      for (const column of [1, 2]) {
        const total = (r: Report) =>
          sum(
            r.sections
              .flatMap((s) => s.rows)
              .filter((row) => row.kind === 'row')
              .map((row) => Number(row.cells[column]) || 0)
          );
        check(
          `Trial balance: ${column === 1 ? 'debits' : 'credits'}`,
          total(bookie),
          total(source)
        );
      }
    });

    const base = org.baseCurrency;
    /** Amount due per currency, as Xero reports it (Bookie never converts). */
    const dueByCurrency = (invoices: RawXeroInvoice[]) => {
      const out = new Map<string, number>();
      for (const i of invoices) {
        const c = i.CurrencyCode || base || '';
        out.set(c, (out.get(c) ?? 0) + (i.AmountDue ?? 0));
      }
      return out;
    };

    for (const [id, type, label] of [
      ['aged-receivables', 'ACCREC', 'receivables'],
      ['aged-payables', 'ACCPAY', 'payables'],
    ] as const) {
      await guard(`Aged ${label}`, async () => {
        const report = await connector.reports!.run(id);
        const authorised = await rawInvoices(type, 'AUTHORISED');
        const byCurrency = dueByCurrency(authorised);
        const multi = byCurrency.size > 1;
        for (const [currency, due] of byCurrency) {
          check(
            `Aged ${label} total${multi ? ' (one currency)' : ''} = sum of AUTHORISED ${type} amount due`,
            value(report, multi ? new RegExp(`^Total ${currency}$`) : /^Total$/, 7),
            sum([due])
          );
        }
        if (multi) note(`Aged ${label}: ${byCurrency.size} currencies, each totalled separately`);
      });
    }

    for (const [type, xeroType, noun] of [
      ['sales', 'ACCREC', 'Sales invoices'],
      ['purchase', 'ACCPAY', 'Bills'],
    ] as const) {
      await guard(`${noun} by status`, async () => {
        for (const [status, xeroStatus] of [
          ['draft', 'DRAFT'],
          ['submitted', 'SUBMITTED'],
          ['authorised', 'AUTHORISED'],
          ['paid', 'PAID'],
        ] as const) {
          const bookie = await countAndSum(connector, type, status);
          const source = await rawInvoices(xeroType, xeroStatus);
          check(`${noun} ${status}: count`, bookie.count, source.length, 0);
          check(`${noun} ${status}: total`, bookie.total, sum(source.map((i) => i.Total ?? 0)));
        }
        const dashboard = await connector.dashboard();
        const buckets = type === 'sales' ? dashboard.receivables : dashboard.payables;
        const awaiting = await rawInvoices(xeroType, 'AUTHORISED');
        check(
          `Home ${noun.toLowerCase()} awaiting payment: count`,
          buckets.awaitingPayment.count,
          awaiting.length,
          0
        );
        const byCurrency = dueByCurrency(awaiting);
        if (byCurrency.size <= 1) {
          check(
            `Home ${noun.toLowerCase()} awaiting payment: amount due`,
            buckets.awaitingPayment.total,
            sum(awaiting.map((i) => i.AmountDue ?? 0))
          );
        } else {
          for (const [currency, due] of byCurrency) {
            check(
              `Home ${noun.toLowerCase()} awaiting payment: amount due (one currency)`,
              buckets.awaitingPayment.byCurrency?.find((c) => c.currency === currency)?.total,
              sum([due])
            );
          }
        }
      });
    }

    await guard('Contacts', async () => {
      let bookie = 0;
      for (let page = 1; page <= 100; page++) {
        const result = await connector.contacts!.list({ page, pageSize: 500 });
        bookie += result.items.length;
        if (!result.hasMore || !result.items.length) break;
      }
      let source = 0;
      for (let page = 1; page <= 100; page++) {
        const { Contacts } = await raw<{ Contacts: unknown[] }>('Contacts', {
          page,
          pageSize: 1000,
          summaryOnly: true,
        });
        source += Contacts.length;
        if (Contacts.length < 1000) break;
      }
      check('Contacts: count', bookie, source, 0);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Business Central                                                    */
/* ------------------------------------------------------------------ */

interface RawBcInvoice {
  status: string;
  totalAmountIncludingTax?: number;
  remainingAmount?: number;
}

interface RawBcLine {
  lineType: string;
  display: string;
  netChange?: number;
  balance?: number;
}

async function bcParity(tenantId: string, entries: string[]) {
  const token = execFileSync('az', [
    'account',
    'get-access-token',
    '--resource',
    'https://api.businesscentral.dynamics.com',
    '--query',
    'accessToken',
    '-o',
    'tsv',
  ])
    .toString()
    .trim();
  for (const [n, entry] of entries.entries()) {
    const [environment, companyId] = entry.split(':');
    const client = new BcClient({ tenantId, environment, companyId, token: async () => token });
    const connector = createBcConnector({
      org: { key: 'parity', kind: 'business-central', name: 'BC company', sourceLabel: 'BC' },
      client,
      companyName: 'BC company',
    });
    console.log(`\n== Business Central company ${n + 1} of ${entries.length} (${environment})`);

    const statuses: [InvoiceStatus, string][] = [
      ['draft', 'Draft'],
      ['submitted', 'In Review'],
      ['authorised', 'Open'],
      ['paid', 'Paid'],
    ];
    for (const [type, entity, noun] of [
      ['sales', 'salesInvoices', 'Sales invoices'],
      ['purchase', 'purchaseInvoices', 'Purchase invoices'],
    ] as const) {
      await guard(`${noun} by status`, async () => {
        const all = await client.all<RawBcInvoice>(entity, {
          // Purchase invoices have no remainingAmount in BC's API, so Bookie shows it as unknown.
          $select: `status,totalAmountIncludingTax${type === 'sales' ? ',remainingAmount' : ''}`,
        });
        for (const [status, bcStatus] of statuses) {
          const bookie = await countAndSum(connector, type, status);
          const source = all.filter((i) => i.status === bcStatus);
          check(`${noun} ${status}: count`, bookie.count, source.length, 0);
          check(
            `${noun} ${status}: total`,
            bookie.total,
            sum(source.map((i) => i.totalAmountIncludingTax ?? 0))
          );
        }
        const dashboard = await connector.dashboard();
        const buckets = type === 'sales' ? dashboard.receivables : dashboard.payables;
        const open = all.filter((i) => i.status === 'Open');
        check(
          `Home ${noun.toLowerCase()} awaiting payment: count`,
          buckets.awaitingPayment.count,
          open.length,
          0
        );
        if (type === 'sales') {
          check(
            `Home ${noun.toLowerCase()} awaiting payment: amount due`,
            buckets.awaitingPayment.total,
            sum(open.map((i) => i.remainingAmount ?? 0))
          );
        } else {
          // No remaining amount from BC: Bookie must count open bills, not total them.
          check(
            `Home ${noun.toLowerCase()} awaiting payment: amounts not available`,
            buckets.awaitingPayment.unknownCount ?? 0,
            open.length,
            0
          );
          if (open.length) {
            check(
              `Home ${noun.toLowerCase()} awaiting payment: no invented total`,
              buckets.awaitingPayment.total === undefined ? 1 : 0,
              1,
              0
            );
          }
        }
      });
    }

    // The real financial year from BC's accounting periods. Without one, Bookie shows no
    // FY P&L tile, and the income statement checks use the current month instead.
    const fy = await bcFiscalYear(client)(today());
    const range = { from: fy.start ?? `${today().slice(0, 7)}-01`, to: today() };
    if (!fy.start) {
      note(`No financial year in BC (${fy.note}); income statement checked for this month`);
    }

    await guard('Income statement', async () => {
      const bookie = await connector.reports!.run('profit-and-loss', range);
      const raw = await client.all<RawBcLine>('incomeStatements', {
        $filter: `dateFilter ge ${range.from} and dateFilter le ${range.to}`,
      });
      const find = (re: RegExp) => raw.find((l) => re.test(l.display))?.netChange;
      // Bookie presents income positive, as BC's own report does; compare magnitudes.
      const income = find(/^Total (Income|Revenue)$/i);
      check(
        'Income statement FY to date: total income',
        Math.abs(value(bookie, /^Total (Income|Revenue)$/i) ?? NaN),
        income === undefined ? undefined : Math.abs(income)
      );
      const net = find(/^Net Income$/i);
      check(
        'Income statement FY to date: net income',
        Math.abs(value(bookie, /^Net Income$/i) ?? NaN),
        net === undefined ? undefined : Math.abs(net)
      );
      const dashboard = await connector.dashboard();
      if (fy.start) {
        check(
          'Home P&L tile: net = income statement',
          Math.abs(dashboard.profitAndLoss?.net ?? NaN),
          net === undefined ? undefined : Math.abs(net)
        );
      } else {
        check(
          'Home P&L tile: omitted without a financial year',
          dashboard.profitAndLoss === undefined && !!dashboard.notes?.profitAndLoss ? 1 : 0,
          1,
          0
        );
      }
      const gl = await client.all<{
        accountNumber: string;
        debitAmount: number;
        creditAmount: number;
      }>('generalLedgerEntries', {
        $filter: `postingDate ge ${range.from} and postingDate le ${range.to}`,
        $select: 'accountNumber,debitAmount,creditAmount',
      });
      const accounts = await client.all<{ number: string; category: string }>('accounts', {
        $select: 'number,category',
      });
      const incomeAccounts = new Set(
        accounts.filter((a) => a.category === 'Income').map((a) => a.number)
      );
      const glIncome = sum(
        gl
          .filter((g) => incomeAccounts.has(g.accountNumber))
          .map((g) => g.creditAmount - g.debitAmount)
      );
      if (Math.abs(glIncome - Math.abs(income ?? 0)) > 0.01) {
        note(
          `BC's incomeStatements page differs from income-category G/L entries by ${diffPercent(glIncome, Math.abs(income ?? 0)).toFixed(2)}%: the company's financial report (account schedule) does not cover every income account. Bookie shows BC's report as BC does.`
        );
      }
    });

    await guard('Balance sheet', async () => {
      const bookie = await connector.reports!.run('balance-sheet', { date: today() });
      const raw = await client.all<RawBcLine>('balanceSheets', {
        $filter: `dateFilter eq ${today()}`,
      });
      for (const label of [/^Total Assets$/i, /^Total Liabilities$/i, /^Total Equity$/i]) {
        check(
          `Balance sheet: ${label.source.replace(/[\^$\\]/g, '')}`,
          value(bookie, label),
          raw.find((l) => label.test(l.display))?.balance
        );
      }
    });

    await guard('Trial balance', async () => {
      const bookie = await connector.reports!.run('trial-balance', { date: today() });
      const total = bookie.sections.at(-1)?.rows[0];
      check('Trial balance: debits = credits', Number(total?.cells[1]), Number(total?.cells[2]));
    });

    for (const [id, entity, label] of [
      ['aged-receivables', 'agedAccountsReceivables', 'receivables'],
      ['aged-payables', 'agedAccountsPayables', 'payables'],
    ] as const) {
      await guard(`Aged ${label}`, async () => {
        const report = await connector.reports!.run(id);
        const raw = await client.all<{
          name: string;
          customerId?: string;
          vendorId?: string;
          balanceDue: number;
        }>(entity);
        const blank = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;
        const parties = raw.filter((l) => !blank.test(l.customerId ?? l.vendorId ?? '') && l.name);
        check(
          `Aged ${label}: total = sum of ${entity} lines`,
          value(report, /^Total$/, 5),
          sum(parties.map((l) => l.balanceDue))
        );
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const tenantId = process.env.PARITY_TENANT_ID ?? process.env.SMOKE_TENANT_ID;
if (!tenantId) {
  console.error('Set PARITY_TENANT_ID (the Entra tenant that owns the connections).');
  process.exit(2);
}
const bcEntries = (process.env.PARITY_BC_COMPANIES ?? process.env.SMOKE_BC_COMPANIES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!process.env.PARITY_SKIP_XERO) await xeroParity(tenantId);
if (bcEntries.length) await bcParity(tenantId, bcEntries);

console.log(
  `\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ''}.`
);
process.exit(failures ? 1 : 0);
