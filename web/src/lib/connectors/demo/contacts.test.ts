import { describe, expect, it } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from './index';

// A separate org slug per test file would share module state; use the second demo org.
const connector = () => createDemoConnector(DEMO_ORGS[1]);

describe('demo contacts', () => {
  it('lists active contacts by default, sorted by name', async () => {
    const page = await connector().contacts!.list({ pageSize: 500 });
    expect(page.items.length).toBeGreaterThan(5);
    expect(page.items.every((c) => c.status === 'active')).toBe(true);
    const names = page.items.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('filters by role, archived and search', async () => {
    const contacts = connector().contacts!;
    const customers = await contacts.list({ role: 'customer', pageSize: 500 });
    expect(customers.items.every((c) => c.isCustomer)).toBe(true);
    const suppliers = await contacts.list({ role: 'supplier', pageSize: 500 });
    expect(suppliers.items.every((c) => c.isSupplier)).toBe(true);
    // One fixture is both, as Xero allows.
    expect(customers.items.some((c) => c.isSupplier)).toBe(true);

    const archived = await contacts.list({ status: 'archived' });
    expect(archived.items.length).toBeGreaterThan(0);
    expect(archived.items.every((c) => c.status === 'archived')).toBe(true);

    const first = customers.items[0];
    const found = await contacts.list({ search: first.name.slice(0, 5).toUpperCase() });
    expect(found.items.map((c) => c.id)).toContain(first.id);
    const none = await contacts.list({ search: 'zzzz-no-such-contact' });
    expect(none.items).toHaveLength(0);
  });

  it('derives balances from open invoices', async () => {
    const c = connector();
    const open = await c.invoices!.list('sales', { status: 'authorised', pageSize: 500 });
    const target = open.items[0];
    const contact = await c.contacts!.get(target.contact.id);
    const expected = open.items
      .filter((i) => i.contact.id === target.contact.id)
      .reduce((s, i) => s + i.amountDue, 0);
    expect(contact.balances?.receivable).toBeCloseTo(expected, 2);
    expect(contact.balances?.overdueReceivable).toBeLessThanOrEqual(expected);
  });

  it('creates, updates and archives', async () => {
    const contacts = connector().contacts!;
    const created = await contacts.create!({
      name: 'Northwind Test Café',
      email: 'test@northwind.example.com',
      phone: '',
      isCustomer: false,
      isSupplier: true,
    });
    expect(created).toMatchObject({ isCustomer: false, isSupplier: true, status: 'active' });
    expect(created.phone).toBeUndefined();

    const updated = await contacts.update!(created.id, { name: 'Northwind Café', email: '' });
    expect(updated.name).toBe('Northwind Café');
    expect(updated.email).toBeUndefined();
    expect(updated.isSupplier).toBe(true);

    const archived = await contacts.archive!(created.id);
    expect(archived.status).toBe('archived');
    const active = await contacts.list({ search: 'Northwind Café' });
    expect(active.items).toHaveLength(0);
  });

  it('404s unknown contacts', async () => {
    await expect(connector().contacts!.get('nope')).rejects.toMatchObject({ status: 404 });
  });
});
