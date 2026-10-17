import { expect, test } from '@playwright/test';

// Runs against the demo organisation (BOOKIE_DEV_AUTH=demo).
const ORG = '/portal/demo.contoso';

test.describe('Global search', () => {
  test('opens from the top bar magnifier with an empty state', async ({ page }) => {
    await page.goto(ORG);
    await page.getByRole('link', { name: 'Search' }).first().click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
    await expect(page.getByText('Search this organisation')).toBeVisible();
    await expect(page.getByRole('searchbox')).toBeFocused();
  });

  test('groups results for contacts, invoices and bills', async ({ page }) => {
    await page.goto(`${ORG}/search`);
    await page.getByRole('searchbox').fill('INV-');
    await expect(page).toHaveURL(/q=INV-/);
    const invoices = page.getByTestId('results-invoices');
    await expect(invoices.getByRole('heading', { name: 'Invoices' })).toBeVisible();
    const firstInvoice = invoices.getByRole('listitem').first().getByRole('link');
    await expect(firstInvoice).toBeVisible();
    await expect(page.getByRole('link', { name: 'View all invoices' })).toBeVisible();

    await firstInvoice.click();
    await expect(page).toHaveURL(/\/sales\/invoices\/[^/]+$/);
  });

  test('finds a contact and links to it', async ({ page }) => {
    await page.goto(`${ORG}/contacts?role=supplier`);
    const name = (await page.getByTestId('contact-name').first().innerText()).trim();
    await page.goto(`${ORG}/search?q=${encodeURIComponent(name)}`);
    const contacts = page.getByTestId('results-contacts');
    await expect(contacts.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
    // A supplier's bills match by contact name too.
    await expect(page.getByTestId('results-bills')).toBeVisible();
    await contacts.getByRole('listitem').first().getByRole('link').click();
    await expect(page).toHaveURL(/\/contacts\/[^/?]+$/);
  });

  test('shows a no-results state', async ({ page }) => {
    await page.goto(`${ORG}/search?q=zzqx-nothing-here`);
    await expect(page.getByText('No results for “zzqx-nothing-here”')).toBeVisible();
  });
});
