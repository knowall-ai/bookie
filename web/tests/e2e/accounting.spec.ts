import { expect, test } from '@playwright/test';

/** Accounting tab on the demo organisation (BOOKIE_DEV_AUTH=demo). */
const ORG = '/portal/demo.contoso';

test.describe('Accounting', () => {
  test('opens on bank accounts with balances', async ({ page }) => {
    await page.goto(`${ORG}/accounting`);
    await expect(page).toHaveURL(/\/accounting\/bank$/);
    await expect(page.getByRole('heading', { name: 'Bank accounts', level: 1 })).toBeVisible();
    const card = page.getByRole('article', { name: 'Business Current Account' });
    await expect(card).toContainText('Balance in books');
    await expect(card.getByTestId('unreconciled')).toBeVisible();
  });

  test('lists an account’s transactions with spent and received columns', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank`);
    await page
      .getByRole('article', { name: 'Business Current Account' })
      .getByRole('link', { name: 'Account transactions' })
      .click();
    await expect(page.getByRole('heading', { name: 'Business Current Account' })).toBeVisible();
    for (const column of ['Date', 'Description', 'Reference', 'Spent', 'Received', 'Reconciled']) {
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
    }
    await expect(page.getByRole('row')).not.toHaveCount(1);
  });

  test('spend money posts after confirmation and shows in the register', async ({ page }) => {
    const description = `E2E milk ${Date.now()}`;
    await page.goto(`${ORG}/accounting/bank/new?type=spend&account=acc-090`);
    await expect(page.getByRole('heading', { name: 'Spend money' })).toBeVisible();
    await page.getByTestId('bank-contact').selectOption({ label: 'Coho Packaging' });
    await page.getByTestId('bank-line-0-description').fill(description);
    await page.getByTestId('bank-line-0-price').fill('24');
    await page.getByTestId('bank-line-0-account').selectOption('310');
    await expect(page.getByTestId('bank-total')).toHaveText('£24.00');
    await page.getByTestId('bank-save').click();
    await page.getByTestId('confirm-action').click();
    await expect(page).toHaveURL(/\/accounting\/bank\/acc-090$/);
    await expect(page.getByText(description)).toBeVisible();
  });

  test('chart of accounts has Xero tabs and labels', async ({ page }) => {
    await page.goto(`${ORG}/accounting/chart`);
    for (const tab of [
      'All accounts',
      'Assets',
      'Liabilities',
      'Equity',
      'Expenses',
      'Revenue',
      'Archive',
    ]) {
      await expect(page.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
    await page.getByRole('tab', { name: /^Liabilities/ }).click();
    await expect(page.getByRole('cell', { name: 'Current Liability' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Revenue' })).toHaveCount(0);
  });

  test('a new manual journal only posts when balanced', async ({ page }) => {
    const narration = `E2E accrual ${Date.now()}`;
    await page.goto(`${ORG}/accounting/journals/new`);
    await page.getByTestId('journal-narration').fill(narration);
    await page.getByTestId('journal-line-0-account').selectOption('445');
    await page.getByTestId('journal-line-0-debit').fill('100');
    await page.getByTestId('journal-line-1-account').selectOption('825');
    await page.getByTestId('journal-line-1-credit').fill('90');
    await expect(page.getByTestId('journal-balance')).toContainText('Out of balance by £10.00');
    await expect(page.getByTestId('journal-post')).toBeDisabled();
    await page.getByTestId('journal-line-1-credit').fill('100');
    await expect(page.getByTestId('journal-balance')).toHaveText('Debits equal credits.');
    await page.getByTestId('journal-post').click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByRole('heading', { name: narration })).toBeVisible();
    await expect(page.getByText('Posted').first()).toBeVisible();
  });

  test('fixed assets, tax rates and payments render', async ({ page }) => {
    await page.goto(`${ORG}/accounting/assets`);
    await expect(page.getByRole('tab', { name: /Registered/, selected: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Book value' })).toBeVisible();
    await page.getByRole('tab', { name: 'Sold & disposed' }).click();
    await expect(page.getByRole('columnheader', { name: 'Book value' })).toHaveCount(0);

    await page.goto(`${ORG}/accounting/tax-rates`);
    await expect(page.getByRole('cell', { name: '20% (VAT on Income)' })).toBeVisible();

    await page.goto(`${ORG}/accounting/payments`);
    await expect(page.getByRole('heading', { name: 'Payments', level: 1 })).toBeVisible();
  });
});
