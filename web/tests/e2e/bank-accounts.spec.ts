import { expect, test } from '@playwright/test';

/**
 * "Add bank account" on the demo organisation (BOOKIE_DEV_AUTH=demo). Writes use
 * the second demo org so they don't disturb other specs. Fictional data only.
 */
const WHOLESALE = '/portal/demo.contoso-wholesale';

test.describe('Add bank account', () => {
  test('adds a bank account after confirmation, in a currency the books have', async ({ page }) => {
    const name = `E2E Euro Account ${Date.now()}`;
    await page.goto(`${WHOLESALE}/accounting/bank`);
    await page.getByRole('link', { name: 'Add bank account' }).click();
    await expect(page).toHaveURL(/\/accounting\/bank\/add$/);
    await expect(page.getByRole('heading', { name: 'Add bank account' })).toBeVisible();

    // Only the currencies the books have, and nothing chosen for you.
    const currency = page.getByTestId('bank-account-currency');
    await expect(currency).toHaveValue('');
    const codes = await currency
      .locator('option')
      .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    expect(codes).toEqual(['', 'GBP', 'EUR', 'USD']);
    await expect(page.getByTestId('bank-account-currency-hint')).toContainText(
      'Only the currencies set up in the demo books are listed.'
    );

    await page.getByTestId('bank-account-type').selectOption('bank');
    await page.getByTestId('bank-account-name').fill(name);
    // Xero needs an account number on a bank account.
    await expect(page.getByTestId('bank-account-save')).toBeDisabled();
    await page.getByTestId('bank-account-number').fill('DE00 1234 5678');
    await currency.selectOption('EUR');
    await page.getByTestId('bank-account-save').click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Add this bank account?');
    await expect(dialog).toContainText('live books');
    await page.getByTestId('confirm-action').click();

    await expect(page).toHaveURL(/\/accounting\/bank$/);
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByText(`${name} added`)).toBeVisible();
  });

  test('labels the account number the way Xero does for cards and PayPal', async ({ page }) => {
    await page.goto(`${WHOLESALE}/accounting/bank/add`);
    await page.getByTestId('bank-account-type').selectOption('credit-card');
    await expect(page.getByLabel('Last 4 digits of the card')).toBeVisible();
    await page.getByTestId('bank-account-type').selectOption('paypal');
    await expect(page.getByLabel('PayPal email address')).toBeVisible();
  });
});
