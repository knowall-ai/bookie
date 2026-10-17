import { expect, test } from '@playwright/test';

/*
 * People and access. The member specs run on the usual demo server
 * (BOOKIE_DEV_AUTH=demo). The guest specs run on a second server signed in as
 * the demo guest accountant (BOOKIE_DEV_AUTH=demo-guest), whose seeded access
 * entry grants Contoso Coffee Roasters only. See playwright.config.ts.
 */
const GUEST_BASE_URL = process.env.GUEST_BASE_URL ?? 'http://localhost:3121';

test.describe('guest accountant', () => {
  test.use({ baseURL: GUEST_BASE_URL });

  test('sees only the organisation they were given', async ({ page }) => {
    await page.goto('/portal');
    const list = page.getByTestId('org-list');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByText('Contoso Coffee Roasters Ltd')).toBeVisible();
    await expect(page.getByText('Contoso Wholesale Ltd')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Add a connection/ })).toHaveCount(0);

    await page.getByTestId('org-switcher').click();
    await expect(page.getByRole('option')).toHaveCount(1);
  });

  test('gets a 404 for an organisation they were not given', async ({ page }) => {
    const denied = await page.goto('/portal/demo.contoso-wholesale');
    expect(denied?.status()).toBe(404);
    const deniedTab = await page.goto('/portal/demo.contoso-wholesale/sales/invoices');
    expect(deniedTab?.status()).toBe(404);
    const allowed = await page.goto('/portal/demo.contoso');
    expect(allowed?.status()).toBe(200);

    const events = await page.request.get('/api/orgs/demo.contoso-wholesale/events');
    expect(events.status()).toBe(404);
    const tool = await page.request.post('/api/bookie/tool', {
      data: { orgKey: 'demo.contoso-wholesale', name: 'list_invoices', arguments: '{}' },
    });
    expect(tool.status()).toBe(404);
    const pdf = await page.request.get('/api/orgs/demo.contoso-wholesale/invoices/x/pdf');
    expect(pdf.status()).toBe(404);
  });

  test('cannot open settings', async ({ page }) => {
    await page.goto('/portal/settings');
    const blocked = page.getByTestId('settings-guest');
    await expect(
      blocked.getByRole('heading', {
        name: 'Ask an administrator at Contoso to change connections',
      })
    ).toBeVisible();
    await expect(page.getByTestId('toggle-xeroEnabled')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'People and access' })).toHaveCount(0);
  });
});

test.describe('People and access (member)', () => {
  test('lists the guest and lets a member add, grant and remove a person', async ({ page }) => {
    await page.goto('/portal/settings');
    const card = page.locator('section', {
      has: page.getByRole('heading', { name: 'People and access' }),
    });
    await expect(card).toBeVisible();
    await expect(card.getByText('Guests see nothing until they’re listed here.')).toBeVisible();
    await expect(card.getByTestId('toggle-membersSeeAll')).toHaveAttribute('aria-checked', 'true');

    const guest = card.locator('[data-email="jordan.lee@fabrikam.example"]');
    await expect(guest.getByText('Jordan Lee', { exact: true })).toBeVisible();
    await expect(
      guest.getByRole('checkbox', { name: /Contoso Coffee Roasters Ltd/ })
    ).toBeChecked();
    await expect(guest.getByRole('checkbox', { name: /Contoso Wholesale Ltd/ })).not.toBeChecked();

    const email = `e2e-${Date.now()}@example.com`;
    await card.getByLabel('Email').fill(email);
    await card.getByLabel('Name').fill('Robin Example');
    await card.getByTestId('add-person').click();
    const person = card.locator(`[data-email="${email}"]`);
    await expect(person.getByText('No organisations')).toBeVisible();

    await person.getByRole('checkbox', { name: /Contoso Wholesale Ltd/ }).check();
    await person.getByRole('button', { name: 'Save access' }).click();
    await expect(person.getByText('1 organisation')).toBeVisible();

    await person.getByRole('button', { name: 'Remove Robin Example' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(person).toHaveCount(0);
  });
});
