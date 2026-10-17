import { expect, test } from '@playwright/test';

// Runs against the demo organisation (BOOKIE_DEV_AUTH=demo).
const ORG = '/portal/demo.contoso';

test.describe('Contacts', () => {
  test('lists contacts with Xero tabs and columns', async ({ page }) => {
    await page.goto(`${ORG}/contacts`);
    await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
    for (const tab of ['All', 'Customers', 'Suppliers', 'Archived']) {
      await expect(page.getByRole('tab', { name: tab })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    for (const header of ['Contact', 'Email', 'Phone', 'You owe', 'They owe']) {
      await expect(page.getByRole('columnheader', { name: header })).toBeVisible();
    }
    expect(await page.getByRole('row').count()).toBeGreaterThan(3);
  });

  test('switches tabs via ?role= and ?status=', async ({ page }) => {
    await page.goto(`${ORG}/contacts`);
    await page.getByRole('tab', { name: 'Suppliers' }).click();
    await expect(page).toHaveURL(/role=supplier/);
    await expect(page.getByRole('heading', { level: 1, name: 'Suppliers' })).toBeVisible();

    await page.getByRole('tab', { name: 'Archived' }).click();
    await expect(page).toHaveURL(/status=archived/);
    await expect(page.getByRole('heading', { level: 1, name: 'Archived contacts' })).toBeVisible();
    await expect(page.getByRole('row')).not.toHaveCount(0);
  });

  test('searches contacts', async ({ page }) => {
    await page.goto(`${ORG}/contacts`);
    const firstName = (await page.getByTestId('contact-name').first().innerText()).trim();
    await page.getByPlaceholder('Search by name, email or account number').fill(firstName);
    await expect(page).toHaveURL(/search=/);
    await expect(page.locator('tbody tr').first()).toContainText(firstName);

    await page.getByPlaceholder('Search by name, email or account number').fill('zzqx-nobody');
    await expect(page.getByText('No contacts match “zzqx-nobody”')).toBeVisible();
  });

  test('shows a contact with details, balances and documents', async ({ page }) => {
    await page.goto(`${ORG}/contacts?role=customer`);
    await page.locator('tbody tr').first().locator('a').first().click();
    await expect(page).toHaveURL(/\/contacts\/[^/?]+$/);
    await expect(page.getByText('Contact details')).toBeVisible();
    await expect(page.getByText('Customer', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('They owe you')).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Invoices/ })).toBeVisible();
    const invoice = page.locator('section[aria-labelledby="recent-invoices"] tbody a').first();
    if (await invoice.count()) {
      await invoice.click();
      await expect(page).toHaveURL(/\/sales\/invoices\//);
    }
  });

  test('creates, edits and archives a contact', async ({ page }) => {
    const name = `Northwind E2E ${Date.now().toString(36)}`;
    await page.goto(`${ORG}/contacts`);
    await page.getByRole('link', { name: 'New contact' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'New contact' })).toBeVisible();

    // Validation: name is required.
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a contact name.')).toBeVisible();

    await page.getByLabel('Contact name').fill(name);
    await page.getByLabel('Email').fill('e2e@northwind.example.com');
    await page.getByLabel('Phone').fill('0161 496 0555');
    await page.getByLabel('Website').fill('www.northwind.example.com');
    await page.getByLabel('Address line 1').fill('5 Canal Street');
    await page.getByLabel('Town / city').fill('Manchester');
    await page.getByLabel('Supplier').check();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
    await expect(page.getByText('e2e@northwind.example.com')).toBeVisible();
    await expect(page.getByText('5 Canal Street')).toBeVisible();
    await expect(page.getByText('Supplier', { exact: true }).first()).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page.getByLabel('Contact name')).toHaveValue(name);
    await page.getByLabel('Email').fill('');
    await page.getByLabel('Account number').fill('NW-E2E');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('NW-E2E')).toBeVisible();
    await expect(page.getByText('e2e@northwind.example.com')).toHaveCount(0);

    await page.getByRole('button', { name: 'Archive' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`Archive ${name}?`);
    await dialog.getByRole('button', { name: 'Archive' }).click();
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);

    await page.goto(`${ORG}/contacts?status=archived&search=${encodeURIComponent(name)}`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('shows not found for an unknown contact', async ({ page }) => {
    // The portal streams (loading.tsx), so not-found renders in a 200 response.
    await page.goto(`${ORG}/contacts/does-not-exist`);
    await expect(page.getByText('Not found', { exact: true })).toBeVisible();
  });
});
