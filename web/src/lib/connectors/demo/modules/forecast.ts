import type { BankTransaction } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData, type DemoInvoice } from '../data';
import { demoSlot } from './state';

/*
 * Fictional fixtures for the cash flow forecast (Reporting › Cash flow forecast):
 * unpaid invoices and bills falling due over the coming months, a draft and an
 * awaiting-approval document, and a year of everyday spend and receive money
 * (café takings, wages, energy) for the projection to average. The generated
 * demo books only have documents dated in the past, which would leave the
 * forecast nearly empty.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

type Spec = [
  type: 'sales' | 'purchase',
  contactId: string,
  dueInDays: number,
  net: number,
  description: string,
  status?: 'draft' | 'submitted',
];

const DOCUMENTS: Spec[] = [
  ['sales', 'cust-1', 4, 2_480, 'Espresso blend 1kg: hotel restock'],
  ['sales', 'cust-2', 11, 3_960, 'Filter roast 1kg: quarterly order'],
  ['sales', 'cust-5', 19, 1_740, 'Decaf 500g and espresso blend'],
  ['sales', 'cust-3', 27, 5_250, 'Barista training (three sites)'],
  ['sales', 'cust-6', 38, 1_320, 'Espresso blend 1kg'],
  ['sales', 'cust-7', 52, 4_100, 'Office coffee subscription: quarter'],
  ['sales', 'cust-4', 66, 2_200, 'Grinder service and filter roast'],
  ['sales', 'cust-8', 95, 3_480, 'Wholesale espresso blend'],
  ['sales', 'cust-1', 130, 6_000, 'Hotel group annual supply: first stage'],
  ['purchase', 'supp-1', 6, 4_850, 'Green beans: Colombia lot'],
  ['purchase', 'supp-2', 13, 1_180, 'Freight: European pallets'],
  ['purchase', 'supp-1', 24, 9_800, 'Green beans: Ethiopia harvest contract'],
  ['purchase', 'supp-3', 33, 2_150, 'Retail bags and labels'],
  ['purchase', 'supp-4', 45, 1_420, 'Roaster gas and electricity'],
  ['purchase', 'supp-1', 74, 6_300, 'Green beans: Brazil lot'],
  ['purchase', 'supp-3', 110, 1_900, 'Compostable pods'],
  ['sales', 'cust-2', 30, 2_750, 'Filter roast 1kg: pop-up event', 'draft'],
  ['purchase', 'supp-2', 21, 3_600, 'Freight: new roaster delivery', 'submitted'],
];

function documents(data: DemoData): DemoInvoice[] {
  const today = DEMO_TODAY();
  return DOCUMENTS.flatMap(([type, contactId, dueIn, net, description, status], i) => {
    const contact = data.contacts.find((c) => c.id === contactId);
    if (!contact) return [];
    const dueDate = addDays(today, dueIn);
    const date = addDays(dueDate, -30);
    const tax = r2(net * 0.2);
    const total = r2(net + tax);
    return [
      {
        id: `${type === 'sales' ? 'inv' : 'bill'}-fc-${i + 1}`,
        type,
        number:
          type === 'sales' ? `INV-${String(1200 + i).padStart(4, '0')}` : `BILL-${String(700 + i)}`,
        reference: type === 'sales' ? `PO ${5100 + i}` : undefined,
        contact: { id: contact.id, name: contact.name },
        date: date > today ? today : date,
        dueDate,
        status: status ?? 'authorised',
        currency: 'GBP',
        lineAmountType: 'exclusive',
        subTotal: net,
        totalTax: tax,
        total,
        amountDue: total,
        amountPaid: 0,
        isOverdue: false,
        lineItems: [
          {
            description,
            quantity: 1,
            unitAmount: net,
            accountCode: type === 'sales' ? '200' : '310',
            taxType: type === 'sales' ? 'OUTPUT2' : 'INPUT2',
            taxAmount: tax,
            lineAmount: net,
          },
        ],
        payments: [],
      } satisfies DemoInvoice,
    ];
  });
}

/** A year of everyday money that never had an invoice or bill: what the projection averages. */
function everydayMoney(): BankTransaction[] {
  const today = DEMO_TODAY();
  const rows: BankTransaction[] = [];
  for (let m = 0; m < 12; m++) {
    const day = (offset: number) => addDays(today, -(m * 30 + offset));
    const common = {
      bankAccountId: 'acc-090',
      bankAccountName: 'Business Current Account',
      currency: 'GBP',
      isReconciled: m > 0,
      status: 'authorised' as const,
      source: 'bank-transaction' as const,
    };
    rows.push(
      {
        ...common,
        id: `bt-fc-takings-${m + 1}`,
        date: day(6),
        type: 'receive',
        reference: 'TAKINGS',
        description: 'Café counter takings',
        amount: 2_150 + ((m * 137) % 500),
      },
      {
        ...common,
        id: `bt-fc-wages-${m + 1}`,
        date: day(8),
        type: 'spend',
        reference: 'WAGES',
        description: 'Part-time roaster wages',
        amount: 1_900,
      },
      {
        ...common,
        id: `bt-fc-energy-${m + 1}`,
        date: day(12),
        type: 'spend',
        reference: 'DD TREY',
        description: 'Trey Energy direct debit',
        amount: 280 + ((m * 53) % 90),
      }
    );
  }
  return rows;
}

/** Seed the forecast fixtures once per demo org (kept on the shared demo data). */
export function seedForecastFixtures(data: DemoData) {
  demoSlot(data, 'forecast-seeded', () => {
    data.invoices.push(...documents(data));
    data.invoices.sort((a, b) => b.date.localeCompare(a.date));
    const history = everydayMoney();
    data.bankTransactions.push(...history);
    data.bankTransactions.sort((a, b) => b.date.localeCompare(a.date));
    // Keep "Balance in books" consistent with the register.
    const current = data.bankAccounts.find((a) => a.id === 'acc-090');
    if (current) {
      const net = history.reduce((s, t) => s + (t.type === 'receive' ? t.amount : -t.amount), 0);
      current.balance = r2((current.balance ?? 0) + net);
      if (current.statementBalance !== undefined) {
        const reconciled = history.filter((t) => t.isReconciled);
        current.statementBalance = r2(
          current.statementBalance +
            reconciled.reduce((s, t) => s + (t.type === 'receive' ? t.amount : -t.amount), 0)
        );
      }
    }
    return true;
  });
}
