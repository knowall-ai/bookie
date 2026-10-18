import { DEMO_MAILBOX } from '@/lib/auth/dev';
import { addDays, demoData, DEMO_TODAY } from '@/lib/connectors/demo/data';
import { demoPdf } from '@/lib/connectors/demo/modules/fixture-files';
import type { Extraction } from '@/lib/accounts-inbox/extraction';
import { MailboxError, type MailFile, type MailMessage } from './graph';

/**
 * The fictional demo accounts mailbox (BOOKIE_DEV_AUTH=demo only): a lookalike
 * phishing invoice, one already in the books, new ones, a statement, a supplier whose
 * address changed and one whose bank details changed. Each fixture carries what the
 * document prints, so the demo needs no model. Every name, domain and number is made up.
 */

export { DEMO_MAILBOX };

interface Fixture {
  message: MailMessage;
  /** The printed document, per attachment id. */
  documents: Record<string, { title: string; lines: string[]; reading?: Extraction }>;
}

const passed = (domain: string) => [
  {
    name: 'Authentication-Results',
    value: `mx.microsoft.com; spf=pass (sender IP is 192.0.2.10) smtp.mailfrom=${domain}; dkim=pass (signature was verified) header.d=${domain}; dmarc=pass action=none header.from=${domain}; compauth=pass reason=100`,
  },
  {
    name: 'X-Forefront-Antispam-Report',
    value: 'CIP:192.0.2.10;CTRY:GB;LANG:en;SCL:1;SRV:;CAT:NONE;',
  },
  { name: 'Return-Path', value: `bounces@${domain}` },
];

const at = (daysAgo: number, time: string) => `${addDays(DEMO_TODAY(), -daysAgo)}T${time}Z`;

const blankAddress = {
  line1: null,
  line2: null,
  city: null,
  region: null,
  postalCode: null,
  country: null,
};

function reading(
  partial: Partial<Extraction> & Pick<Extraction, 'kind' | 'kindReason'>
): Extraction {
  return {
    supplier: {
      name: null,
      address: null,
      taxNumber: null,
      companyNumber: null,
      email: null,
      phone: null,
      bankDetails: null,
    },
    billTo: { name: 'Contoso Coffee Roasters Ltd', taxNumber: null },
    invoiceNumber: null,
    invoiceDate: null,
    dueDate: null,
    currency: null,
    currencyAsPrinted: null,
    amountsAre: null,
    lines: [],
    net: null,
    vat: null,
    total: null,
    poReference: null,
    unsure: [],
    ...partial,
  };
}

const gbp = (n: number) => `£${n.toFixed(2)}`;

function fixtures(): Fixture[] {
  const data = demoData('contoso');
  const supplier = (id: string) => data.contacts.find((c) => c.id === id);
  const alpine = supplier('supp-1');
  const trey = supplier('supp-4');
  const lucerne = supplier('supp-5');
  const today = DEMO_TODAY();
  const out: Fixture[] = [];

  // 1. A lookalike of Coho Packaging's domain, failing DMARC: suspicious, never read.
  out.push({
    message: {
      id: 'demo-mail-lookalike',
      subject: 'URGENT: overdue invoice CP-7781, pay today to avoid legal action',
      receivedDateTime: at(1, '07:42:00'),
      from: { emailAddress: { name: 'Coho Packaging', address: 'accounts@c0ho.example' } },
      sender: { emailAddress: { address: 'accounts@c0ho.example' } },
      replyTo: [{ emailAddress: { address: 'payments@quick-settle.example' } }],
      internetMessageHeaders: [
        {
          name: 'Authentication-Results',
          value:
            'mx.microsoft.com; spf=softfail smtp.mailfrom=c0ho.example; dkim=none (message not signed) header.d=none; dmarc=fail action=quarantine header.from=c0ho.example; compauth=fail reason=000',
        },
        {
          name: 'X-Forefront-Antispam-Report',
          value: 'CIP:198.51.100.7;CTRY:;LANG:en;SCL:5;SRV:;CAT:SPOOF;',
        },
      ],
      attachments: [
        { id: 'att-1', name: 'CP-7781.pdf', contentType: 'application/pdf', size: 1800 },
      ],
    },
    documents: {
      'att-1': {
        title: 'INVOICE CP-7781',
        lines: ['Coho Packaging', 'Amount due: £4,860.00', 'New bank details: see below'],
      },
    },
  });

  // 2. Already in the books: the latest demo supplier bill, emailed as a PDF.
  const bill = data.invoices.find((i) => i.type === 'purchase' && i.status !== 'draft');
  const billSupplier = bill && data.contacts.find((c) => c.id === bill.contact.id);
  if (bill && billSupplier?.email) {
    const domain = billSupplier.email.split('@')[1];
    const lines = (bill.lineItems ?? []).map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitAmount,
      net: l.lineAmount,
      vatRate: 20,
      vat: l.taxAmount ?? null,
    }));
    out.push({
      message: {
        id: 'demo-mail-in-books',
        subject: `Invoice ${bill.number} from ${billSupplier.name}`,
        receivedDateTime: at(2, '10:05:00'),
        from: { emailAddress: { name: billSupplier.name, address: billSupplier.email } },
        sender: { emailAddress: { address: billSupplier.email } },
        replyTo: [],
        internetMessageHeaders: passed(domain),
        attachments: [
          {
            id: 'att-1',
            name: `${bill.number}.pdf`,
            contentType: 'application/pdf',
            size: 2100,
          },
        ],
      },
      documents: {
        'att-1': {
          title: `Invoice ${bill.number}`,
          lines: [
            billSupplier.name,
            `Invoice date ${bill.date}`,
            `Net ${gbp(bill.subTotal)}  VAT ${gbp(bill.totalTax)}  Total ${gbp(bill.total)}`,
          ],
          reading: reading({
            kind: 'invoice',
            kindReason: 'A supplier invoice with a number, date and amount due.',
            supplier: {
              name: billSupplier.name,
              address: billSupplier.address ? { ...blankAddress, ...billSupplier.address } : null,
              taxNumber: billSupplier.taxNumber ?? null,
              companyNumber: null,
              email: billSupplier.email,
              phone: billSupplier.phone ?? null,
              bankDetails: null,
            },
            invoiceNumber: bill.number,
            invoiceDate: bill.date,
            dueDate: bill.dueDate ?? null,
            currency: 'GBP',
            currencyAsPrinted: '£',
            amountsAre: 'exclusive',
            lines,
            net: bill.subTotal,
            vat: bill.totalTax,
            total: bill.total,
          }),
        },
      },
    });
  }

  // 3. New and ready to file, from a known supplier.
  if (alpine?.email) {
    out.push({
      message: {
        id: 'demo-mail-new',
        subject: 'Alpine Green Beans invoice AGB-2291',
        receivedDateTime: at(0, '08:15:00'),
        from: { emailAddress: { name: 'Alpine Green Beans', address: alpine.email } },
        sender: { emailAddress: { address: alpine.email } },
        replyTo: [],
        internetMessageHeaders: passed('alpinegreen.example'),
        attachments: [
          { id: 'att-1', name: 'AGB-2291.pdf', contentType: 'application/pdf', size: 2400 },
        ],
      },
      documents: {
        'att-1': {
          title: 'Invoice AGB-2291',
          lines: [
            'Alpine Green Beans',
            `Invoice date ${addDays(today, -1)}   Due ${addDays(today, 29)}`,
            'Green coffee, Colombia Huila, 60kg sack  x2  £180.00  £360.00',
            'Net £360.00   VAT 20% £72.00   Total £432.00',
          ],
          reading: reading({
            kind: 'invoice',
            kindReason: 'A supplier invoice with a number, date and amount due.',
            supplier: {
              name: alpine.name,
              address: alpine.address ? { ...blankAddress, ...alpine.address } : null,
              taxNumber: alpine.taxNumber ?? null,
              companyNumber: null,
              email: alpine.email,
              phone: alpine.phone ?? null,
              bankDetails: {
                accountName: alpine.name,
                sortCode: '04-00-00',
                accountNumber: '41000000',
                iban: null,
                bic: null,
              },
            },
            invoiceNumber: 'AGB-2291',
            invoiceDate: addDays(today, -1),
            dueDate: addDays(today, 29),
            currency: 'GBP',
            currencyAsPrinted: '£',
            amountsAre: 'exclusive',
            lines: [
              {
                description: 'Green coffee, Colombia Huila, 60kg sack',
                quantity: 2,
                unitPrice: 180,
                net: 360,
                vatRate: 20,
                vat: 72,
              },
            ],
            net: 360,
            vat: 72,
            total: 432,
          }),
        },
      },
    });
  }

  // 4. A statement of account: not an invoice.
  out.push({
    message: {
      id: 'demo-mail-statement',
      subject: 'Your monthly statement from Blue Yonder Freight',
      receivedDateTime: at(3, '16:30:00'),
      from: {
        emailAddress: { name: 'Blue Yonder Freight', address: 'billing@blueyonder.example' },
      },
      sender: { emailAddress: { address: 'billing@blueyonder.example' } },
      replyTo: [],
      internetMessageHeaders: passed('blueyonder.example'),
      attachments: [
        { id: 'att-1', name: 'Statement.pdf', contentType: 'application/pdf', size: 1900 },
      ],
    },
    documents: {
      'att-1': {
        title: 'Statement of account',
        lines: ['Blue Yonder Freight', 'Opening balance, invoices and payments for last month'],
        reading: reading({
          kind: 'statement',
          kindReason: 'A statement listing invoices and payments, not a bill to pay.',
          supplier: {
            name: 'Blue Yonder Freight',
            address: null,
            taxNumber: null,
            companyNumber: null,
            email: null,
            phone: null,
            bankDetails: null,
          },
        }),
      },
    },
  });

  // 5. A new supplier, never seen before.
  out.push({
    message: {
      id: 'demo-mail-new-supplier',
      subject: 'Invoice WOS-1042',
      receivedDateTime: at(4, '11:20:00'),
      from: {
        emailAddress: { name: 'Wingtip Office Supplies', address: 'orders@wingtip.example' },
      },
      sender: { emailAddress: { address: 'orders@wingtip.example' } },
      replyTo: [],
      internetMessageHeaders: passed('wingtip.example'),
      attachments: [
        { id: 'att-1', name: 'WOS-1042.pdf', contentType: 'application/pdf', size: 2000 },
      ],
    },
    documents: {
      'att-1': {
        title: 'Invoice WOS-1042',
        lines: [
          'Wingtip Office Supplies Ltd, 14 Canal Street, Leeds LS1 4AB',
          'Printer paper, A4, box of 5 reams  x3  £24.00  £72.00',
          'Net £72.00   VAT 20% £14.40   Total £86.40',
        ],
        reading: reading({
          kind: 'invoice',
          kindReason: 'A supplier invoice with a number, date and amount due.',
          supplier: {
            name: 'Wingtip Office Supplies Ltd',
            address: {
              ...blankAddress,
              line1: '14 Canal Street',
              city: 'Leeds',
              postalCode: 'LS1 4AB',
              country: 'United Kingdom',
            },
            taxNumber: 'GB 999 0001 42',
            companyNumber: '09990142',
            email: 'orders@wingtip.example',
            phone: '0113 496 0142',
            bankDetails: {
              accountName: 'Wingtip Office Supplies Ltd',
              sortCode: '04-00-99',
              accountNumber: '41009999',
              iban: null,
              bic: null,
            },
          },
          invoiceNumber: 'WOS-1042',
          invoiceDate: addDays(today, -4),
          dueDate: null,
          currency: 'GBP',
          currencyAsPrinted: '£',
          amountsAre: 'exclusive',
          lines: [
            {
              description: 'Printer paper, A4, box of 5 reams',
              quantity: 3,
              unitPrice: 24,
              net: 72,
              vatRate: 20,
              vat: 14.4,
            },
          ],
          net: 72,
          vat: 14.4,
          total: 86.4,
        }),
      },
    },
  });

  // 6. A known supplier whose address and phone on the invoice differ from the books.
  if (trey?.email) {
    out.push({
      message: {
        id: 'demo-mail-address-changed',
        subject: 'Trey Energy bill TE-55012 (we have moved)',
        receivedDateTime: at(5, '09:00:00'),
        from: { emailAddress: { name: 'Trey Energy', address: trey.email } },
        sender: { emailAddress: { address: trey.email } },
        replyTo: [],
        internetMessageHeaders: passed('trey.example'),
        attachments: [
          { id: 'att-1', name: 'TE-55012.pdf', contentType: 'application/pdf', size: 2200 },
        ],
      },
      documents: {
        'att-1': {
          title: 'Electricity bill TE-55012',
          lines: [
            'Trey Energy, Unit 7 Riverside Park, Bristol BS2 0JA',
            'Electricity, last month  £310.00',
            'Net £310.00   VAT 5% £15.50   Total £325.50',
          ],
          reading: reading({
            kind: 'invoice',
            kindReason: 'A utility bill with a number, date and amount due.',
            supplier: {
              name: trey.name,
              address: {
                ...blankAddress,
                line1: 'Unit 7 Riverside Park',
                city: 'Bristol',
                postalCode: 'BS2 0JA',
                country: 'United Kingdom',
              },
              taxNumber: trey.taxNumber ?? null,
              companyNumber: null,
              email: trey.email,
              phone: '0117 496 0277',
              bankDetails: null,
            },
            invoiceNumber: 'TE-55012',
            invoiceDate: addDays(today, -5),
            dueDate: addDays(today, 9),
            currency: 'GBP',
            currencyAsPrinted: '£',
            amountsAre: 'exclusive',
            lines: [
              {
                description: 'Electricity, last month',
                quantity: 1,
                unitPrice: 310,
                net: 310,
                vatRate: 5,
                vat: 15.5,
              },
            ],
            net: 310,
            vat: 15.5,
            total: 325.5,
          }),
        },
      },
    });
  }

  // 7. A known supplier, genuine mail, but the invoice asks for payment to a new account.
  if (lucerne?.email) {
    out.push({
      message: {
        id: 'demo-mail-bank-changed',
        subject: 'Rent invoice LP-2026-10: please note our new bank account',
        receivedDateTime: at(6, '13:45:00'),
        from: { emailAddress: { name: 'Lucerne Property', address: lucerne.email } },
        sender: { emailAddress: { address: lucerne.email } },
        replyTo: [],
        internetMessageHeaders: passed('lucerne.example'),
        attachments: [
          { id: 'att-1', name: 'LP-2026-10.pdf', contentType: 'application/pdf', size: 2300 },
        ],
      },
      documents: {
        'att-1': {
          title: 'Rent invoice LP-2026-10',
          lines: [
            'Lucerne Property',
            'Rent, next quarter  £3,000.00',
            'Pay to: sort code 09-01-28, account 77341920',
          ],
          reading: reading({
            kind: 'invoice',
            kindReason: 'A rent invoice with a number, date and amount due.',
            supplier: {
              name: lucerne.name,
              address: lucerne.address ? { ...blankAddress, ...lucerne.address } : null,
              taxNumber: lucerne.taxNumber ?? null,
              companyNumber: null,
              email: lucerne.email,
              phone: lucerne.phone ?? null,
              bankDetails: {
                accountName: 'Lucerne Property',
                sortCode: '09-01-28',
                accountNumber: '77341920',
                iban: null,
                bic: null,
              },
            },
            invoiceNumber: 'LP-2026-10',
            invoiceDate: addDays(today, -6),
            dueDate: addDays(today, 8),
            currency: 'GBP',
            currencyAsPrinted: '£',
            amountsAre: 'no-tax',
            lines: [
              {
                description: 'Rent, next quarter',
                quantity: 1,
                unitPrice: 3000,
                net: 3000,
                vatRate: null,
                vat: null,
              },
            ],
            net: 3000,
            vat: null,
            total: 3000,
          }),
        },
      },
    });
  }
  return out;
}

/** The demo mailbox, read like the real one. */
export class DemoMailbox {
  readonly mailbox = DEMO_MAILBOX;

  private find(id: string): Fixture {
    const hit = fixtures().find((f) => f.message.id === id);
    if (!hit) throw new MailboxError('That email is no longer in the mailbox.', 'not-found', 404);
    return hit;
  }

  async list(since: string, max: number): Promise<MailMessage[]> {
    return fixtures()
      .map((f) => f.message)
      .filter((m) => (m.receivedDateTime ?? '') >= since)
      .sort((a, b) => (b.receivedDateTime ?? '').localeCompare(a.receivedDateTime ?? ''))
      .slice(0, max);
  }

  async message(id: string): Promise<MailMessage> {
    return this.find(id).message;
  }

  async attachment(messageId: string, attachmentId: string): Promise<MailFile> {
    const fixture = this.find(messageId);
    const meta = fixture.message.attachments.find((a) => a.id === attachmentId);
    const document = fixture.documents[attachmentId];
    if (!meta || !document)
      throw new MailboxError('That attachment is no longer in the mailbox.', 'not-found', 404);
    return {
      fileName: meta.name,
      contentType: meta.contentType,
      bytes: demoPdf(document.title, document.lines),
    };
  }

  /** What the demo document prints (the demo has no model). */
  reading(messageId: string, attachmentId: string): Extraction | undefined {
    return structuredClone(this.find(messageId).documents[attachmentId]?.reading);
  }
}
