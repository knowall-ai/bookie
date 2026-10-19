import 'server-only';
import type { AccountingConnector } from '@/lib/connectors/types';
import { isConnectorError } from '@/lib/connectors/types';
import type { Invoice } from '@/lib/domain/types';
import type { ToolDefinition } from './llm';
import type { BookieSuggestion, SuggestionAction, SuggestionSubject } from './suggestion-types';

/**
 * `suggest_action`: Bookie puts a next step in front of the user as a card with a
 * button, like Poppie's recommendations in Thyme. Bookie never runs it: links open a
 * portal page, and writes (approve, email) go through the usual ConfirmDialog and
 * server action. Each suggestion is checked against the live record, so Bookie can't
 * offer a step the source doesn't support or the record's status doesn't allow.
 */

export const MAX_SUGGESTIONS = 5;

const ACTIONS = [
  'approve_invoice',
  'email_invoice',
  'open_invoice',
  'open_contact',
  'open_bank_account',
  'pay_bills',
  'open_page',
] as const;
type ActionName = (typeof ACTIONS)[number];

/** Pages Bookie can point to, and the module each one needs. */
const PAGES: Record<
  string,
  { path: string; label: string; needs: (c: AccountingConnector) => boolean }
> = {
  overdue_invoices: {
    path: 'sales/invoices?status=overdue',
    label: 'View overdue invoices',
    needs: (c) => !!c.invoices,
  },
  draft_invoices: {
    path: 'sales/invoices?status=draft',
    label: 'View draft invoices',
    needs: (c) => !!c.invoices,
  },
  invoices_awaiting_approval: {
    path: 'sales/invoices?status=submitted',
    label: 'View invoices to approve',
    needs: (c) => !!c.invoices,
  },
  bills_awaiting_payment: {
    path: 'purchases/bills?status=authorised',
    label: 'View bills to pay',
    needs: (c) => !!c.invoices,
  },
  overdue_bills: {
    path: 'purchases/bills?status=overdue',
    label: 'View overdue bills',
    needs: (c) => !!c.invoices,
  },
  bills_awaiting_approval: {
    path: 'purchases/bills?status=submitted',
    label: 'View bills to approve',
    needs: (c) => !!c.invoices,
  },
  quotes: { path: 'sales/quotes', label: 'View quotes', needs: (c) => !!c.quotes },
  bank_accounts: { path: 'accounting/bank', label: 'View bank accounts', needs: (c) => !!c.bank },
  cash_flow_forecast: {
    path: 'reporting/cash-flow-forecast',
    label: 'Open cash flow forecast',
    needs: (c) => !!c.invoices,
  },
};

export const suggestToolDefinition: ToolDefinition = {
  type: 'function',
  name: 'suggest_action',
  description: `Show the user a recommended next step as a card with a button they can action in the portal. Call it once per step (at most ${MAX_SUGGESTIONS} per answer), only for steps you recommend in your answer. You never run the step: the user clicks and, for anything that writes to the books, confirms. approve_invoice: approve a draft or submitted invoice or bill (id). email_invoice: email an approved sales invoice to the customer, e.g. a reminder for an overdue one (id). open_invoice: open an invoice or bill, e.g. to record a payment (id). open_contact: open a customer or supplier (id). open_bank_account: open a bank account's register, e.g. to reconcile (id). pay_bills: open Pay bills to pay several approved bills at once. open_page: open a filtered list (page). Ids are the ones the other tools returned. The result says whether the card was shown; if not, don't mention the button.`,
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...ACTIONS] },
      id: { type: 'string', description: 'The invoice, bill, contact or bank account id' },
      page: { type: 'string', enum: Object.keys(PAGES), description: 'For open_page' },
      title: {
        type: 'string',
        description: 'The step in a few words, e.g. "Chase Fabrikam\'s overdue invoice"',
      },
      reason: {
        type: 'string',
        description:
          'One sentence on why, with the real figure, e.g. "GBP 1,200.00, 16 days overdue."',
      },
      severity: {
        type: 'string',
        enum: ['info', 'warning', 'issue'],
        description:
          'issue = needs doing now (overdue, cash short); warning = soon; info = tidy-up',
      },
    },
    required: ['action', 'title', 'reason', 'severity'],
    additionalProperties: false,
  },
};

export type SuggestionResult =
  { ok: true; suggestion: BookieSuggestion } | { ok: false; error: string };

const text = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

const invoicePath = (base: string, invoice: Pick<Invoice, 'id' | 'type'>) =>
  `${base}/${invoice.type === 'sales' ? 'sales/invoices' : 'purchases/bills'}/${encodeURIComponent(invoice.id)}`;

function invoiceSubject(base: string, invoice: Invoice): SuggestionSubject {
  const noun = invoice.type === 'sales' ? 'Invoice' : 'Bill';
  return {
    kind: 'invoice',
    label: invoice.number ? `${noun} ${invoice.number}` : noun,
    href: invoicePath(base, invoice),
    contact: invoice.contact.name,
    amountDue: invoice.amountDue,
    currency: invoice.currency || undefined,
    dueDate: invoice.dueDate,
    overdue: invoice.isOverdue,
  };
}

/** Turn Bookie's `suggest_action` call into a card, checked against the live record. */
export async function buildSuggestion(
  connector: AccountingConnector,
  base: string,
  rawArgs: string
): Promise<SuggestionResult> {
  let args: Record<string, unknown>;
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, error: 'Arguments were not valid JSON.' };
  }
  const action = args.action as ActionName;
  const title = text(args.title, 120);
  const reason = text(args.reason, 300);
  if (!ACTIONS.includes(action)) return { ok: false, error: 'Unknown action.' };
  if (!title || !reason) return { ok: false, error: 'A title and a reason are required.' };
  const severity: BookieSuggestion['severity'] =
    args.severity === 'issue' || args.severity === 'warning' ? args.severity : 'info';
  const id = text(args.id, 200);

  const card = (key: string, act: SuggestionAction, subject?: SuggestionSubject) => ({
    ok: true as const,
    suggestion: { id: `${action}:${key}`, title, reason, severity, subject, action: act },
  });

  try {
    switch (action) {
      case 'approve_invoice':
      case 'email_invoice':
      case 'open_invoice': {
        if (!connector.invoices) return { ok: false, error: 'Invoices are not available here.' };
        if (!id) return { ok: false, error: 'An invoice or bill id is required.' };
        const invoice = await connector.invoices.get(id);
        const subject = invoiceSubject(base, invoice);
        const noun = invoice.type === 'sales' ? 'invoice' : 'bill';
        const named = invoice.number ? `${noun} ${invoice.number}` : `this ${noun}`;
        if (action === 'open_invoice') {
          return card(
            invoice.id,
            { kind: 'link', label: `Open ${noun}`, href: subject.href },
            subject
          );
        }
        if (action === 'approve_invoice') {
          if (!connector.invoices.approve)
            return { ok: false, error: 'Approving is not available for this organisation.' };
          if (invoice.status !== 'draft' && invoice.status !== 'submitted')
            return {
              ok: false,
              error: `The ${noun} is ${invoice.status}, so it can't be approved.`,
            };
          return card(
            invoice.id,
            {
              kind: 'invoice',
              action: 'approve',
              invoiceId: invoice.id,
              label: 'Approve',
              confirm: {
                title: `Approve ${named}?`,
                body: 'It will be posted to your accounts and become awaiting payment. This writes to your live books.',
                cta: 'Approve',
              },
              done: `${named[0].toUpperCase()}${named.slice(1)} approved`,
            },
            subject
          );
        }
        if (invoice.type !== 'sales')
          return { ok: false, error: 'Only sales invoices can be emailed.' };
        if (!connector.invoices.email)
          return { ok: false, error: 'Emailing invoices is not available for this organisation.' };
        if (invoice.status !== 'authorised')
          return {
            ok: false,
            error: `The invoice is ${invoice.status}; only approved invoices can be emailed.`,
          };
        return card(
          invoice.id,
          {
            kind: 'invoice',
            action: 'email',
            invoiceId: invoice.id,
            label: 'Email invoice',
            confirm: {
              title: `Email ${named} to ${invoice.contact.name}?`,
              body: 'Your accounting system will email it to the contact using its template.',
              cta: 'Send email',
            },
            done: `${named[0].toUpperCase()}${named.slice(1)} emailed`,
          },
          subject
        );
      }
      case 'open_contact': {
        if (!connector.contacts) return { ok: false, error: 'Contacts are not available here.' };
        if (!id) return { ok: false, error: 'A contact id is required.' };
        const contact = await connector.contacts.get(id);
        const href = `${base}/contacts/${encodeURIComponent(contact.id)}`;
        return card(
          contact.id,
          { kind: 'link', label: 'Open contact', href },
          { kind: 'contact', label: contact.name, href }
        );
      }
      case 'open_bank_account': {
        if (!connector.bank) return { ok: false, error: 'Bank accounts are not available here.' };
        if (!id) return { ok: false, error: 'A bank account id is required.' };
        const account = (await connector.bank.accounts()).find((a) => a.id === id);
        if (!account) return { ok: false, error: 'No bank account has that id.' };
        const href = `${base}/accounting/bank/${encodeURIComponent(account.id)}`;
        return card(
          account.id,
          { kind: 'link', label: 'Open bank account', href },
          { kind: 'bank-account', label: account.name, href }
        );
      }
      case 'pay_bills': {
        if (!connector.payments?.createBatch || !connector.invoices || !connector.bank)
          return {
            ok: false,
            error: 'Paying several bills at once is not available for this organisation.',
          };
        return card('all', {
          kind: 'link',
          label: 'Pay bills',
          href: `${base}/purchases/bills/pay`,
        });
      }
      case 'open_page': {
        const page = typeof args.page === 'string' ? PAGES[args.page] : undefined;
        if (!page) return { ok: false, error: 'Unknown page.' };
        if (!page.needs(connector)) return { ok: false, error: 'That page is not available here.' };
        return card(String(args.page), {
          kind: 'link',
          label: page.label,
          href: `${base}/${page.path}`,
        });
      }
    }
  } catch (error) {
    return {
      ok: false,
      error: isConnectorError(error) ? error.message : 'Could not find that record.',
    };
  }
}
