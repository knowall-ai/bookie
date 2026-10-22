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

const ORG = '/portal/demo.contoso';

test.describe('Bank account cards', () => {
  for (const [where, path] of [
    ['dashboard', ORG],
    ['Accounting, Bank accounts', `${ORG}/accounting/bank`],
  ] as const) {
    test(`show balance history and feed freshness on the ${where}`, async ({ page }) => {
      await page.goto(path);
      const card = page.getByTestId('bank-account-card').first();
      await expect(card.getByTestId('balance-chart')).toBeVisible();
      await expect(card.locator('.recharts-area-curve')).toBeVisible();
      await expect(card.getByText('Last 4 weeks', { exact: true })).toBeVisible();
      await expect(card.getByTestId('bank-feed')).toContainText('Bank feed: last statement line');
      await expect(card.getByTestId('read-live')).toHaveText(
        'Read live from the demo books just now'
      );
      // Screen readers get the history as a sentence.
      await expect(card.getByText(/^Balance over the last 4 weeks: /)).toBeAttached();

      // Hovering the chart shows a day's balance.
      // Recharts sizes itself after hydration, so hover again until the tooltip answers.
      // On screen first: mouse coordinates are the viewport's, and the card may sit below it.
      await card.getByTestId('balance-chart').scrollIntoViewIfNeeded();
      await expect(async () => {
        const box = (await card.getByTestId('balance-chart').boundingBox())!;
        await page.mouse.move(box.x + 2, box.y + 2);
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
        await expect(card.locator('.recharts-tooltip-wrapper')).toContainText('£', {
          timeout: 1000,
        });
      }).toPass();

      // The chart is part of the link to the account's transactions.
      await card.getByTestId('balance-chart').click();
      await expect(page).toHaveURL(/\/accounting\/bank\/acc-09\d$/);
    });
  }
});
