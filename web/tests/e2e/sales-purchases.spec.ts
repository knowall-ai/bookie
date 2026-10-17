import { expect, test } from '@playwright/test';

/** Read-only checks use Contoso; anything that writes uses the Wholesale demo org. */
const ORG = '/portal/demo.contoso';
const WRITE_ORG = '/portal/demo.contoso-wholesale';

test.describe('sales overview', () => {
  test('shows the four invoice status cards and links to filtered lists', async ({ page }) => {
    await page.goto(`${ORG}/sales`);
    await expect(page.getByRole('heading', { name: 'Sales overview' })).toBeVisible();
    for (const id of ['draft', 'awaiting-approval', 'awaiting-payment', 'overdue']) {
      await expect(page.getByTestId(`overview-${id}`)).toBeVisible();
    }
    await page.getByTestId('overview-draft').click();
    await expect(page).toHaveURL(/\/sales\/invoices\?status=draft/);
  });

  test('purchases overview lists recent bills', async ({ page }) => {
    await page.goto(`${ORG}/purchases`);
    await expect(page.getByRole('heading', { name: 'Purchases overview' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent bills' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });
});

test.describe('quotes', () => {
  test('status tabs follow Xero and filter the list', async ({ page }) => {
    await page.goto(`${ORG}/sales/quotes`);
    await expect(page.getByRole('tab', { name: 'All' })).toBeVisible();
    const tabs = await page.getByRole('tab').allInnerTexts();
    expect(tabs.map((t) => t.trim())).toEqual([
      'All',
      'Draft',
      'Sent',
      'Declined',
      'Accepted',
      'Invoiced',
    ]);
    await page.getByRole('tab', { name: 'Accepted' }).click();
    await expect(page.getByRole('tab', { name: 'Accepted', selected: true })).toBeVisible();
    const statuses = await page.locator('tbody tr td:last-child').allInnerTexts();
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(status.trim()).toBe('Accepted');
  });

  test('create a quote, mark it sent and accepted, then invoice it', async ({ page }) => {
    await page.goto(`${WRITE_ORG}/sales/quotes/new`);
    await page.getByTestId('editor-contact').selectOption({ label: 'Litware Cafe' });
    await page.getByLabel('Title').fill('Weekly espresso order');
    await page.getByTestId('line-0-description').fill('Espresso blend 1kg');
    await page.getByLabel('Quantity').first().fill('5');
    await page.getByTestId('line-0-price').fill('24');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /^Quote QU-/ })).toBeVisible();
    await expect(page.getByText('Weekly espresso order')).toBeVisible();

    await page.getByRole('button', { name: 'Mark as sent' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Create invoice' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page).toHaveURL(/\/sales\/invoices\/inv-new-/);
    await expect(page.getByRole('heading', { name: /^Invoice INV-/ })).toBeVisible();
  });
});

test.describe('credit notes', () => {
  test('sales and supplier credit notes are listed separately', async ({ page }) => {
    await page.goto(`${ORG}/sales/credit-notes`);
    await expect(page.getByRole('heading', { name: 'Credit notes' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('CN-');
    await page.goto(`${ORG}/purchases/credit-notes`);
    await expect(page.getByRole('heading', { name: 'Supplier credit notes' })).toBeVisible();
    await page.locator('tbody tr a').first().click();
    await expect(page.getByText('Remaining credit').last()).toBeVisible();
  });
});

test.describe('purchase orders', () => {
  test('create a draft purchase order', async ({ page }) => {
    await page.goto(`${WRITE_ORG}/purchases/orders/new`);
    await page.getByTestId('editor-contact').selectOption({ label: 'Alpine Green Beans' });
    await page.getByTestId('line-0-description').fill('Green beans, Brazil, 60kg sack');
    await page.getByTestId('line-0-price').fill('210');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /^Purchase order PO-/ })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
  });
});

test.describe('products and services', () => {
  test('add an item and find it by search', async ({ page }) => {
    // Demo writes last until the server restarts, so keep the code unique per run.
    const code = `SYRUP-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    await page.goto(`${WRITE_ORG}/sales/products/new`);
    await page.getByTestId('item-code').fill(code);
    await page.getByTestId('item-name').fill('Vanilla syrup 1L');
    await page.getByTestId('item-salePrice').fill('9.5');
    await page.getByTestId('item-save').click();
    await expect(page.getByRole('heading', { name: /Vanilla syrup 1L/ })).toBeVisible();
    await page.goto(`${WRITE_ORG}/sales/products?search=${code}`);
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });
});

test.describe('record a payment', () => {
  test('pay part of an invoice after confirming', async ({ page }) => {
    await page.goto(`${WRITE_ORG}/sales/invoices?status=authorised`);
    await page.locator('tbody tr a').first().click();
    const panel = page.getByTestId('payment-panel');
    await expect(panel).toBeVisible();
    await page.getByTestId('payment-amount').fill('10');
    await page.getByTestId('payment-bank').selectOption({ index: 1 });
    await page.getByTestId('payment-add').click();
    await expect(page.getByRole('alertdialog')).toContainText('Record this payment?');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Less payments')).toBeVisible();
  });
});
