import { describe, expect, it } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '@/lib/connectors/demo';
import type { AccountingConnector } from '@/lib/connectors/types';
import { bookieInstructions } from './prompt';
import { buildSuggestion } from './suggestions';

const base = '/portal/demo';
const connector = () => createDemoConnector(DEMO_ORGS[0]);
const call = (c: AccountingConnector, args: Record<string, unknown>) =>
  buildSuggestion(c, base, JSON.stringify({ title: 'Do it', reason: 'Because.', ...args }));

async function firstInvoice(c: AccountingConnector, type: 'sales' | 'purchase', status: string) {
  const [invoice] = (await c.invoices!.list(type, { status })).items;
  expect(invoice, `a demo ${type} invoice with status ${status}`).toBeDefined();
  return invoice;
}

describe("Bookie's suggestions", () => {
  it('offers Approve for a draft, with the record as the source reported it', async () => {
    const c = connector();
    const draft = await firstInvoice(c, 'sales', 'draft');
    const result = await call(c, { action: 'approve_invoice', id: draft.id, severity: 'warning' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion).toMatchObject({
      id: `approve_invoice:${draft.id}`,
      severity: 'warning',
      subject: {
        kind: 'invoice',
        href: `${base}/sales/invoices/${encodeURIComponent(draft.id)}`,
        contact: draft.contact.name,
        amountDue: draft.amountDue,
        currency: draft.currency,
      },
      action: { kind: 'invoice', action: 'approve', invoiceId: draft.id },
    });
  });

  it("won't offer Approve or Email when the status doesn't allow it", async () => {
    const c = connector();
    const paid = await firstInvoice(c, 'sales', 'paid');
    expect(await call(c, { action: 'approve_invoice', id: paid.id })).toMatchObject({ ok: false });
    expect(await call(c, { action: 'email_invoice', id: paid.id })).toMatchObject({ ok: false });
    const bill = await firstInvoice(c, 'purchase', 'authorised');
    expect(await call(c, { action: 'email_invoice', id: bill.id })).toMatchObject({
      ok: false,
      error: 'Only sales invoices can be emailed.',
    });
  });

  it('offers Email for an approved sales invoice', async () => {
    const c = connector();
    const invoice = await firstInvoice(c, 'sales', 'authorised');
    const result = await call(c, { action: 'email_invoice', id: invoice.id });
    expect(result).toMatchObject({
      ok: true,
      suggestion: { severity: 'info', action: { kind: 'invoice', action: 'email' } },
    });
  });

  it("hides a step the organisation's source can't do", async () => {
    const c = connector();
    const draft = await firstInvoice(c, 'sales', 'draft');
    const noApprove = { ...c, invoices: { ...c.invoices!, approve: undefined } };
    expect(await call(noApprove, { action: 'approve_invoice', id: draft.id })).toMatchObject({
      ok: false,
    });
    const noBatch = { ...c, payments: { ...c.payments!, createBatch: undefined } };
    expect(await call(noBatch, { action: 'pay_bills' })).toMatchObject({ ok: false });
  });

  it('builds links on the server, never from what Bookie wrote', async () => {
    const c = connector();
    const [contact] = (await c.contacts!.list()).items;
    expect(await call(c, { action: 'open_contact', id: contact.id })).toMatchObject({
      ok: true,
      suggestion: {
        action: { kind: 'link', href: `${base}/contacts/${encodeURIComponent(contact.id)}` },
      },
    });
    expect(await call(c, { action: 'open_page', page: 'overdue_invoices' })).toMatchObject({
      ok: true,
      suggestion: { action: { href: `${base}/sales/invoices?status=overdue` } },
    });
    expect(await call(c, { action: 'open_page', page: 'https://example.com' })).toMatchObject({
      ok: false,
    });
    expect(await call(c, { action: 'open_bank_account', id: 'no-such-account' })).toMatchObject({
      ok: false,
    });
  });

  it('rejects unknown records and missing fields', async () => {
    const c = connector();
    expect(await call(c, { action: 'open_invoice', id: 'no-such-invoice' })).toMatchObject({
      ok: false,
    });
    expect(await buildSuggestion(c, base, '{"action":"pay_bills"}')).toMatchObject({ ok: false });
    expect(await buildSuggestion(c, base, 'not json')).toMatchObject({ ok: false });
  });

  it('tells Bookie to offer cards in chat and on Home, but not by voice', () => {
    const user = { name: 'Alex Morgan', userType: 'Member' as const };
    expect(bookieInstructions(DEMO_ORGS[0], user, 'chat')).toContain('call suggest_action');
    expect(bookieInstructions(DEMO_ORGS[0], user, 'insights')).toContain('call suggest_action');
    expect(bookieInstructions(DEMO_ORGS[0], user, 'voice')).not.toContain('suggest_action');
  });
});
