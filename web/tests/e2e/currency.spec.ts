import { expect, test } from '@playwright/test';

/** Read-only checks use Contoso; anything that writes uses the Wholesale demo org. */
const ORG = '/portal/demo.contoso';
const WRITE_ORG = '/portal/demo.contoso-wholesale';
const EUR_CUSTOMER = 'Fabrikam Hôtels Paris SARL';

test.describe('multi-currency', () => {
  test('a euro invoice shows its currency, rate and sterling total', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices/inv-eur-2`);
    await expect(page.getByTestId('doc-currency')).toHaveText('EUR');
    await expect(page.getByTestId('doc-currency-rate')).toHaveText('1.1648 EUR per 1 GBP');
    await expect(page.getByText('€1,850.00').first()).toBeVisible();
    // 1,850.00 / 1.1648, at the invoice's own rate.
    await expect(page.getByText('Total in GBP')).toBeVisible();
    await expect(page.getByText('£1,588.26')).toBeVisible();
  });

  test('the invoices list shows euro invoices in euros', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices?search=Fabrikam%20H`);
    await expect(page.getByRole('row').filter({ hasText: 'INV-1091' })).toContainText('€1,850.00');
  });

  test('a base-currency invoice shows no currency facts', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices/inv-0004`);
    await expect(page.getByRole('heading', { name: /^Invoice / })).toBeVisible();
    await expect(page.getByTestId('doc-currency')).toHaveCount(0);
  });

  test('the editor defaults the currency from the contact and takes a rate', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices/new`);
    const currency = page.getByTestId('editor-currency');
    await expect(currency).toHaveValue('GBP');
    await expect(page.getByTestId('editor-currency-rate')).toHaveCount(0);

    await page.getByTestId('editor-contact').selectOption({ label: EUR_CUSTOMER });
    await expect(currency).toHaveValue('EUR');
    await page.getByTestId('line-0-description').fill('Espresso blend 1kg');
    await page.getByTestId('line-0-price').fill('116.48');
    await expect(page.getByTestId('editor-total')).toContainText('€116.48');
    await page.getByTestId('editor-currency-rate').fill('1.1648');
    await expect(page.getByTestId('editor-total-base')).toContainText('£100.00');

    // A sterling customer switches it back, until the currency is chosen by hand.
    await page.getByTestId('editor-contact').selectOption({ label: 'Litware Cafe' });
    await expect(currency).toHaveValue('GBP');
    await currency.selectOption('USD');
    await page.getByTestId('editor-contact').selectOption({ label: EUR_CUSTOMER });
    await expect(currency).toHaveValue('USD');
  });

  test('save a euro invoice and pay it into a sterling account', async ({ page }) => {
    await page.goto(`${WRITE_ORG}/sales/invoices/new`);
    await page.getByTestId('editor-contact').selectOption({ label: EUR_CUSTOMER });
    await expect(page.getByTestId('editor-currency')).toHaveValue('EUR');
    await page.getByTestId('line-0-description').fill('Filter roast 1kg');
    await page.getByTestId('line-0-price').fill('125');
    await page.getByTestId('editor-currency-rate').fill('1.25');
    await page.getByTestId('save-approve').click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByRole('heading', { name: /^Invoice INV-/ })).toBeVisible();
    await expect(page.getByTestId('doc-currency')).toHaveText('EUR');
    await expect(page.getByTestId('doc-currency-rate')).toHaveText('1.25 EUR per 1 GBP');

    const panel = page.getByTestId('payment-panel');
    await expect(panel.getByText('Amount paid (EUR)')).toBeVisible();
    await page.getByTestId('payment-bank').selectOption('acc-090');
    await page.getByTestId('payment-rate').fill('1.25');
    await expect(page.getByTestId('payment-base')).toContainText('£');
    await page.getByTestId('payment-add').click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();
  });

  test('the dashboard totals are in sterling', async ({ page }) => {
    await page.goto(ORG);
    await expect(page.getByRole('heading', { name: 'Invoices owed to you' })).toBeVisible();
    // Every euro demo invoice has a rate, so nothing is left out.
    await expect(page.getByTestId('documents-note')).toHaveCount(0);
  });
});
