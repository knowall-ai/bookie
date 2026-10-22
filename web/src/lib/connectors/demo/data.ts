/**
 * Fictional demo books for "Contoso Coffee Roasters Ltd". Deterministic, so
 * Playwright assertions and public screenshots are stable. Every name here is
 * invented: this is the only data allowed in screenshots and tests.
 */
import type {
  Account,
  BankAccount,
  BankTransaction,
  Contact,
  Invoice,
  InvoiceStatus,
  Item,
} from '@/lib/domain/types';

/** Small seeded PRNG so the data is the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export const DEMO_TODAY = () => new Date().toISOString().slice(0, 10);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const CUSTOMERS = [
  ['Fabrikam Hotels', 'accounts@fabrikam.example'],
  ['Northwind Traders', 'ap@northwind.example'],
  ['Adventure Works Cycles', 'finance@adventure-works.example'],
  ['Tailspin Toys', 'billing@tailspin.example'],
  ['Wide World Importers', 'ap@wideworld.example'],
  ['Litware Cafe', 'hello@litware.example'],
  ['Proseware Offices', 'payables@proseware.example'],
  ['Woodgrove Bakery', 'orders@woodgrove.example'],
] as const;

const SUPPLIERS = [
  ['Alpine Green Beans', 'invoices@alpinegreen.example'],
  ['Blue Yonder Freight', 'billing@blueyonder.example'],
  ['Coho Packaging', 'accounts@coho.example'],
  ['Trey Energy', 'billing@trey.example'],
  ['Lucerne Property', 'rent@lucerne.example'],
] as const;

export const ITEMS: Item[] = [
  {
    id: 'item-1',
    code: 'ESP-1KG',
    name: 'Espresso blend 1kg',
    salePrice: 24,
    purchasePrice: 11,
    salesAccountCode: '200',
    purchaseAccountCode: '310',
    isSold: true,
    isPurchased: true,
  },
  {
    id: 'item-2',
    code: 'FIL-1KG',
    name: 'Filter roast 1kg',
    salePrice: 22,
    purchasePrice: 10,
    salesAccountCode: '200',
    purchaseAccountCode: '310',
    isSold: true,
    isPurchased: true,
  },
  {
    id: 'item-3',
    code: 'DEC-500',
    name: 'Decaf 500g',
    salePrice: 13,
    purchasePrice: 6,
    salesAccountCode: '200',
    purchaseAccountCode: '310',
    isSold: true,
    isPurchased: true,
  },
  {
    id: 'item-4',
    code: 'TRAIN',
    name: 'Barista training (half day)',
    salePrice: 350,
    salesAccountCode: '260',
    isSold: true,
    isPurchased: false,
  },
  {
    id: 'item-5',
    code: 'GRIND-SVC',
    name: 'Grinder service',
    salePrice: 120,
    salesAccountCode: '260',
    isSold: true,
    isPurchased: false,
  },
];

export const ACCOUNTS: Account[] = [
  {
    id: 'acc-090',
    code: '090',
    name: 'Business Current Account',
    type: 'BANK',
    typeLabel: 'Bank',
    class: 'asset',
    status: 'active',
    isBank: true,
  },
  {
    id: 'acc-091',
    code: '091',
    name: 'Business Savings Account',
    type: 'BANK',
    typeLabel: 'Bank',
    class: 'asset',
    status: 'active',
    isBank: true,
  },
  {
    id: 'acc-200',
    code: '200',
    name: 'Sales',
    type: 'REVENUE',
    typeLabel: 'Revenue',
    class: 'revenue',
    status: 'active',
    isBank: false,
    taxType: 'OUTPUT2',
  },
  {
    id: 'acc-260',
    code: '260',
    name: 'Other Revenue',
    type: 'REVENUE',
    typeLabel: 'Revenue',
    class: 'revenue',
    status: 'active',
    isBank: false,
    taxType: 'OUTPUT2',
  },
  {
    id: 'acc-310',
    code: '310',
    name: 'Cost of Goods Sold',
    type: 'DIRECTCOSTS',
    typeLabel: 'Direct Costs',
    class: 'expense',
    status: 'active',
    isBank: false,
    taxType: 'INPUT2',
  },
  {
    id: 'acc-400',
    code: '400',
    name: 'Advertising',
    type: 'EXPENSE',
    typeLabel: 'Expense',
    class: 'expense',
    status: 'active',
    isBank: false,
    taxType: 'INPUT2',
  },
  {
    id: 'acc-445',
    code: '445',
    name: 'Light, Power, Heating',
    type: 'EXPENSE',
    typeLabel: 'Expense',
    class: 'expense',
    status: 'active',
    isBank: false,
    taxType: 'INPUT2',
  },
  {
    id: 'acc-469',
    code: '469',
    name: 'Rent',
    type: 'EXPENSE',
    typeLabel: 'Expense',
    class: 'expense',
    status: 'active',
    isBank: false,
    taxType: 'INPUT2',
  },
  {
    id: 'acc-477',
    code: '477',
    name: 'Salaries',
    type: 'EXPENSE',
    typeLabel: 'Expense',
    class: 'expense',
    status: 'active',
    isBank: false,
  },
  {
    id: 'acc-610',
    code: '610',
    name: 'Accounts Receivable',
    type: 'CURRENT',
    typeLabel: 'Current Asset',
    class: 'asset',
    status: 'active',
    isBank: false,
  },
  {
    id: 'acc-800',
    code: '800',
    name: 'Accounts Payable',
    type: 'CURRLIAB',
    typeLabel: 'Current Liability',
    class: 'liability',
    status: 'active',
    isBank: false,
  },
  {
    id: 'acc-820',
    code: '820',
    name: 'VAT',
    type: 'CURRLIAB',
    typeLabel: 'Current Liability',
    class: 'liability',
    status: 'active',
    isBank: false,
  },
  {
    id: 'acc-970',
    code: '970',
    name: 'Owner A Funds Introduced',
    type: 'EQUITY',
    typeLabel: 'Equity',
    class: 'equity',
    status: 'active',
    isBank: false,
  },
];

/** Demo invoices always know what's paid and due (they're fictional fixtures). */
export type DemoInvoice = Invoice & { amountDue: number; amountPaid: number };

export interface DemoData {
  contacts: Contact[];
  invoices: DemoInvoice[];
  bankAccounts: BankAccount[];
  bankTransactions: BankTransaction[];
  items: Item[];
  accounts: Account[];
}

function makeInvoices(
  contacts: Contact[],
  type: 'sales' | 'purchase',
  count: number,
  seed: number
): DemoInvoice[] {
  const random = rng(seed);
  const today = DEMO_TODAY();
  const parties = contacts.filter((c) => (type === 'sales' ? c.isCustomer : c.isSupplier));
  return Array.from({ length: count }, (_, i) => {
    const contact = parties[Math.floor(random() * parties.length)];
    const date = addDays(today, -Math.floor(random() * 330) - 1);
    const dueDate = addDays(date, 30);
    const lines = Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
      const item = ITEMS[Math.floor(random() * ITEMS.length)];
      const quantity = 1 + Math.floor(random() * (type === 'sales' ? 40 : 80));
      const unitAmount = type === 'sales' ? (item.salePrice ?? 50) : (item.purchasePrice ?? 40);
      return {
        itemCode: item.code,
        description: item.name,
        quantity,
        unitAmount,
        accountCode: type === 'sales' ? item.salesAccountCode : (item.purchaseAccountCode ?? '310'),
        taxType: type === 'sales' ? 'OUTPUT2' : 'INPUT2',
        taxAmount: Math.round(quantity * unitAmount * 0.2 * 100) / 100,
        lineAmount: quantity * unitAmount,
      };
    });
    const subTotal = lines.reduce((s, l) => s + l.lineAmount, 0);
    const totalTax = Math.round(subTotal * 0.2 * 100) / 100;
    const total = subTotal + totalTax;
    const roll = random();
    const age = (Date.parse(today) - Date.parse(date)) / 86_400_000;
    const status: InvoiceStatus =
      i < 2
        ? 'draft'
        : i < 3
          ? 'submitted'
          : age > 75 && roll < 0.85
            ? 'paid'
            : roll < 0.45
              ? 'paid'
              : 'authorised';
    const amountDue = status === 'paid' ? 0 : total;
    return {
      id: `${type === 'sales' ? 'inv' : 'bill'}-${String(i + 1).padStart(4, '0')}`,
      type,
      number:
        type === 'sales'
          ? `INV-${String(1040 + count - i).padStart(4, '0')}`
          : `BILL-${String(500 + count - i)}`,
      reference: type === 'sales' ? `PO ${4000 + Math.floor(random() * 900)}` : undefined,
      contact: { id: contact.id, name: contact.name },
      date,
      dueDate,
      status,
      currency: 'GBP',
      lineAmountType: 'exclusive',
      subTotal,
      totalTax,
      total,
      amountDue,
      amountPaid: total - amountDue,
      isOverdue: status === 'authorised' && dueDate < today,
      lineItems: lines,
      payments:
        status === 'paid'
          ? [{ id: `pay-${type}-${i}`, date: addDays(date, 20), amount: total }]
          : [],
    } satisfies Invoice;
  }).sort((a, b) => b.date.localeCompare(a.date));
}

const cache = new Map<string, DemoData>();

/** One mutable copy per demo org per server process: demo writes persist until restart. */
export function demoData(slug = 'contoso'): DemoData {
  const hit = cache.get(slug);
  if (hit) return hit;
  const seed = slug === 'contoso' ? 0 : 100;
  const contacts: Contact[] = [
    ...CUSTOMERS.map(([name, email], i) => ({
      id: `cust-${i + 1}`,
      name,
      email,
      phone: `0161 496 0${String(100 + i)}`,
      isCustomer: true,
      isSupplier: false,
      status: 'active' as const,
      address: {
        line1: `${10 + i} Market Street`,
        city: 'Manchester',
        postalCode: `M${i + 1} 1AA`,
        country: 'United Kingdom',
      },
    })),
    ...SUPPLIERS.map(([name, email], i) => ({
      id: `supp-${i + 1}`,
      name,
      email,
      phone: `0117 496 0${String(200 + i)}`,
      isCustomer: false,
      isSupplier: true,
      status: 'active' as const,
      address: {
        line1: `${2 + i} Harbour Road`,
        city: 'Bristol',
        postalCode: `BS${i + 1} 4QT`,
        country: 'United Kingdom',
      },
    })),
  ];
  const invoices = [
    ...makeInvoices(contacts, 'sales', 36, 7 + seed),
    ...makeInvoices(contacts, 'purchase', 22, 11 + seed),
  ];
  for (const contact of contacts) {
    const open = invoices.filter((i) => i.contact.id === contact.id && i.status === 'authorised');
    const due = open.reduce((s, i) => s + i.amountDue, 0);
    contact.balances = contact.isCustomer
      ? {
          receivable: due,
          overdueReceivable: open.filter((i) => i.isOverdue).reduce((s, i) => s + i.amountDue, 0),
        }
      : { payable: due };
  }

  const random = rng(21);
  const bankTransactions: BankTransaction[] = invoices
    .filter((i) => i.status === 'paid')
    .map((i, n) => ({
      id: `bt-${n + 1}`,
      bankAccountId: 'acc-090',
      bankAccountName: 'Business Current Account',
      date: i.payments?.[0]?.date ?? i.date,
      type: i.type === 'sales' ? ('receive' as const) : ('spend' as const),
      contact: i.contact,
      reference: i.number,
      description: `Payment ${i.number}`,
      amount: i.total,
      currency: 'GBP',
      isReconciled: random() > 0.15,
      status: 'authorised' as const,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const balance = bankTransactions.reduce(
    (s, t) => s + (t.type === 'receive' ? t.amount : -t.amount),
    18_500
  );
  const data: DemoData = {
    contacts,
    invoices,
    items: structuredClone(ITEMS),
    accounts: structuredClone(ACCOUNTS),
    bankTransactions,
    bankAccounts: [
      {
        id: 'acc-090',
        name: 'Business Current Account',
        code: '090',
        accountNumber: '20-00-00 41234567',
        currency: 'GBP',
        balance,
        statementBalance: balance - 640.5,
        statementDate: DEMO_TODAY(),
        feedDate: DEMO_TODAY(),
        balanceAsAt: DEMO_TODAY(),
        unreconciledCount: bankTransactions.filter((t) => !t.isReconciled).length,
        type: 'bank',
      },
      {
        id: 'acc-091',
        name: 'Business Savings Account',
        code: '091',
        accountNumber: '20-00-00 49876543',
        currency: 'GBP',
        balance: 25_000,
        statementBalance: 25_000,
        statementDate: DEMO_TODAY(),
        feedDate: DEMO_TODAY(),
        balanceAsAt: DEMO_TODAY(),
        unreconciledCount: 0,
        type: 'bank',
      },
    ],
  };
  cache.set(slug, data);
  return data;
}

export { addDays };
