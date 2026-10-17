import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import { isConnectorError } from '@/lib/connectors/types';
import type { ReportId } from '@/lib/domain/types';
import type { ToolDefinition } from './llm';

/**
 * Bookie's tools: read-only views of the open organisation, executed on the
 * server with the signed-in user's own access. Nothing here can write.
 */

type Args = Record<string, unknown>;

interface Tool {
  definition: ToolDefinition;
  available: (c: AccountingConnector) => boolean;
  run: (c: AccountingConnector, args: Args) => Promise<unknown>;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = []
): ToolDefinition {
  return {
    type: 'function',
    name,
    description,
    parameters: { type: 'object', properties, required, additionalProperties: false },
  };
}

const DATE = { type: 'string', description: 'ISO date YYYY-MM-DD' };
const INVOICE_STATUS = {
  type: 'string',
  enum: ['all', 'draft', 'submitted', 'authorised', 'overdue', 'paid'],
  description: 'submitted = awaiting approval, authorised = awaiting payment',
};

const TOOLS: Tool[] = [
  {
    definition: fn(
      'get_overview',
      'Organisation details plus the dashboard: bank balances, money owed in and out, 12-month income and expenses, profit and loss this financial year.'
    ),
    available: () => true,
    run: async (c) => ({ organisation: await c.organisation(), dashboard: await c.dashboard() }),
  },
  {
    definition: fn(
      'list_invoices',
      'List sales invoices (type "sales") or supplier bills (type "purchase"), newest first. Summary fields only.',
      {
        type: { type: 'string', enum: ['sales', 'purchase'] },
        status: INVOICE_STATUS,
        search: { type: 'string' },
        contact_id: { type: 'string' },
        from: DATE,
        to: DATE,
        page: { type: 'number' },
      },
      ['type']
    ),
    available: (c) => !!c.invoices,
    run: async (c, a) =>
      c.invoices!.list(a.type === 'purchase' ? 'purchase' : 'sales', {
        status: str(a.status),
        search: str(a.search),
        contactId: str(a.contact_id),
        from: str(a.from),
        to: str(a.to),
        page: num(a.page),
        pageSize: 50,
      }),
  },
  {
    definition: fn(
      'get_invoice',
      'One invoice or bill in full, with line items and payments.',
      { id: { type: 'string' } },
      ['id']
    ),
    available: (c) => !!c.invoices,
    run: (c, a) => c.invoices!.get(String(a.id)),
  },
  {
    definition: fn(
      'list_contacts',
      'Customers and suppliers, with outstanding balances where available.',
      {
        role: { type: 'string', enum: ['customer', 'supplier'] },
        search: { type: 'string' },
        page: { type: 'number' },
      }
    ),
    available: (c) => !!c.contacts,
    run: (c, a) =>
      c.contacts!.list({
        role: a.role === 'supplier' ? 'supplier' : a.role === 'customer' ? 'customer' : undefined,
        search: str(a.search),
        page: num(a.page),
        pageSize: 50,
      }),
  },
  {
    definition: fn('get_contact', 'One customer or supplier in full.', { id: { type: 'string' } }, [
      'id',
    ]),
    available: (c) => !!c.contacts,
    run: (c, a) => c.contacts!.get(String(a.id)),
  },
  {
    definition: fn(
      'run_report',
      'Run a financial report. profit-and-loss uses from/to; balance-sheet, trial-balance, aged-receivables and aged-payables use date.',
      {
        report: {
          type: 'string',
          enum: [
            'profit-and-loss',
            'balance-sheet',
            'trial-balance',
            'aged-receivables',
            'aged-payables',
            'bank-summary',
            'executive-summary',
          ],
        },
        from: DATE,
        to: DATE,
        date: DATE,
      },
      ['report']
    ),
    available: (c) => !!c.reports,
    run: async (c, a) => {
      const id = String(a.report) as ReportId;
      if (!c.reports!.available.includes(id))
        return { error: `The ${id} report isn't available for this organisation.` };
      return c.reports!.run(id, { from: str(a.from), to: str(a.to), date: str(a.date) });
    },
  },
  {
    definition: fn('list_bank_accounts', 'Bank accounts with balances.'),
    available: (c) => !!c.bank,
    run: (c) => c.bank!.accounts(),
  },
  {
    definition: fn(
      'list_bank_transactions',
      'Transactions on one bank account, newest first.',
      { bank_account_id: { type: 'string' }, page: { type: 'number' } },
      ['bank_account_id']
    ),
    available: (c) => !!c.bank,
    run: (c, a) =>
      c.bank!.transactions(String(a.bank_account_id), { page: num(a.page), pageSize: 50 }),
  },
  {
    definition: fn('list_quotes', 'Sales quotes, newest first.', {
      status: { type: 'string' },
      search: { type: 'string' },
    }),
    available: (c) => !!c.quotes,
    run: (c, a) => c.quotes!.list({ status: str(a.status), search: str(a.search), pageSize: 50 }),
  },
  {
    definition: fn('list_chart_of_accounts', 'The chart of accounts.'),
    available: (c) => !!c.accounts,
    run: (c) => c.accounts!.list(),
  },
  {
    definition: fn(
      'list_currencies',
      'The currencies this organisation trades in, base currency included. Document amounts are in their own currency; currencyRate on a document is the source rate (units of that currency per 1 base unit). Never convert with any other rate.'
    ),
    available: (c) => !!c.currencies,
    run: async (c) => ({
      baseCurrency: (await c.organisation()).baseCurrency,
      currencies: await c.currencies!.list(),
    }),
  },
];

export function toolsFor(connector: AccountingConnector | undefined): ToolDefinition[] {
  if (!connector) return [];
  return TOOLS.filter((t) => t.available(connector)).map((t) => t.definition);
}

const MAX_RESULT_CHARS = 14_000;

/** Run one tool call; always returns a JSON string the model can read. */
export async function runTool(
  connector: AccountingConnector | undefined,
  name: string,
  rawArgs: string
): Promise<string> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!connector || !tool || !tool.available(connector))
    return JSON.stringify({ error: `Tool ${name} is not available.` });
  let args: Args = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Args) : {};
  } catch {
    return JSON.stringify({ error: 'Arguments were not valid JSON.' });
  }
  try {
    const result = JSON.stringify(await tool.run(connector, args));
    return result.length > MAX_RESULT_CHARS
      ? `${result.slice(0, MAX_RESULT_CHARS)}… [truncated: ask for a narrower search, a filter or the next page]`
      : result;
  } catch (error) {
    return JSON.stringify({
      error: isConnectorError(error) ? error.message : 'The lookup failed.',
    });
  }
}

/** Short, human status line while a tool runs ("Checking overdue invoices…"). */
export function toolStatus(name: string, rawArgs: string): string {
  let args: Args = {};
  try {
    args = JSON.parse(rawArgs || '{}') as Args;
  } catch {
    /* ignore */
  }
  switch (name) {
    case 'get_overview':
      return 'Looking over your dashboard…';
    case 'list_invoices':
      return args.type === 'purchase' ? 'Checking your bills…' : 'Checking your invoices…';
    case 'get_invoice':
      return 'Opening the invoice…';
    case 'list_contacts':
    case 'get_contact':
      return 'Looking up contacts…';
    case 'run_report':
      return `Running the ${String(args.report ?? '').replace(/-/g, ' ')} report…`;
    case 'list_bank_accounts':
    case 'list_bank_transactions':
      return 'Checking the bank…';
    case 'list_quotes':
      return 'Checking your quotes…';
    case 'list_currencies':
      return 'Checking your currencies…';
    default:
      return 'Looking that up…';
  }
}
