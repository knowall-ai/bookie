import { expect, test } from '@playwright/test';

/**
 * Account register filters and detail, manual journal actions, the ledger
 * reports and organisation settings, on the demo organisation (BOOKIE_DEV_AUTH=demo).
 * Write tests use the second demo org so they don't disturb other specs.
 */
const ORG = '/portal/demo.contoso';
const WHOLESALE = '/portal/demo.contoso-wholesale';

test.describe('Account transactions register', () => {
  test('says what the API cannot show and filters by direction and reconciled', async ({
    page,
  }) => {
    await page.goto(`${ORG}/accounting/bank/acc-090`);
    await expect(page.getByRole('note').filter({ hasText: 'bank statement lines' })).toBeVisible();
    const form = page.getByRole('form', { name: 'Filter transactions' });
    await form.getByLabel('Show').selectOption('spent');
    await form.getByLabel('Reconciled').selectOption('no');
    await form.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/direction=spent/);
    await expect(page).toHaveURL(/reconciled=no/);
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    // Spent only: nothing in the Received column.
    const received = await page
      .locator('tbody tr td:nth-child(6)')
      .allInnerTexts()
      .then((cells) => cells.filter((c) => c.trim()));
    expect(received).toEqual([]);
    await expect(page.getByRole('link', { name: 'Clear filters' })).toBeVisible();
  });

  test('opens a spend money transaction with its account coding', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank/acc-090?search=RENT`);
    await page
      .getByRole('link', { name: /Monthly rent: Roastery Yard/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/transactions\/bt-spend-/);
    await expect(
      page.getByRole('heading', { name: /Spend money: Lucerne Property/ })
    ).toBeVisible();
    await expect(page.getByRole('table', { name: 'Line items' })).toContainText('469');
    await expect(page.getByRole('table', { name: 'Line items' })).toContainText('Rent');
    await page.getByRole('link', { name: /All transactions with Lucerne Property/ }).click();
    await expect(page).toHaveURL(/contact=/);
    await expect(page.getByText('Contact: Lucerne Property')).toBeVisible();
  });

  test('a payment links to the invoice it pays', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank/acc-090?direction=received`);
    await page
      .getByRole('link', { name: /Payment INV-/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: /Invoice payment/ })).toBeVisible();
    await page.getByRole('link', { name: /^INV-/ }).click();
    await expect(page).toHaveURL(/\/sales\/invoices\//);
  });
});

test.describe('Manual journals', () => {
  test('lists voided journals in their own tab', async ({ page }) => {
    await page.goto(`${ORG}/accounting/journals`);
    await page.getByRole('link', { name: 'Voided' }).click();
    await expect(page.getByText('Correct duplicate bank fee')).toBeVisible();
  });

  test('posts a draft after confirmation, then offers void', async ({ page }) => {
    const narration = `E2E draft ${Date.now()}`;
    await page.goto(`${WHOLESALE}/accounting/journals/new`);
    await page.getByTestId('journal-narration').fill(narration);
    await page.getByTestId('journal-line-0-account').selectOption('445');
    await page.getByTestId('journal-line-0-debit').fill('25');
    await page.getByTestId('journal-line-1-account').selectOption('825');
    await page.getByTestId('journal-line-1-credit').fill('25');
    await page.getByTestId('journal-save-draft').click();
    await expect(page.getByRole('heading', { name: narration })).toBeVisible();
    await page.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('live books');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Posted', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Void' })).toBeVisible();
  });

  test('reverse opens a new journal with debits and credits swapped', async ({ page }) => {
    await page.goto(`${ORG}/accounting/journals/mj-003`);
    await page.getByRole('link', { name: 'Reverse' }).click();
    await expect(page.getByTestId('journal-narration')).toHaveValue(/^Reversal: /);
    await expect(page.getByTestId('journal-line-0-credit')).toHaveValue('708.33');
    await expect(page.getByTestId('journal-line-1-debit')).toHaveValue('708.33');
    await expect(page.getByTestId('journal-balance')).toHaveText('Debits equal credits.');
  });
});

test.describe('Ledger reports', () => {
  test('account transactions for one account', async ({ page }) => {
    await page.goto(`${ORG}/reporting`);
    await page
      .getByRole('link', { name: /Account transactions/ })
      .first()
      .click();
    await page.getByLabel('Account', { exact: true }).selectOption('090');
    await page.getByLabel('Date range').selectOption({ index: 0 });
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page).toHaveURL(/account=090/);
    const report = page.getByRole('article', { name: 'Account Transactions' });
    await expect(report).toContainText('090 - Business Current Account');
    await expect(report).toContainText('Net movement');
  });

  test('journal report lists balanced journals', async ({ page }) => {
    await page.goto(`${ORG}/reporting/journal-report`);
    const report = page.getByRole('article', { name: 'Journal Report' });
    await expect(report.getByRole('columnheader', { name: 'Debit' })).toBeVisible();
    await expect(report.getByRole('row', { name: /^Total/ }).first()).toBeVisible();
  });
});

test.describe('Organisation settings', () => {
  test('shows organisation, financial and tax settings and the users', async ({ page }) => {
    await page.goto(ORG);
    await page
      .getByRole('button', { name: /Contoso Coffee Roasters/ })
      .first()
      .click();
    await page.getByRole('link', { name: 'Organisation settings' }).click();
    await expect(page.getByRole('heading', { name: 'Organisation settings' })).toBeVisible();
    for (const title of ['Organisation details', 'Financial settings', 'Tax settings', 'Users']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    await expect(page.getByText('31 March')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Adviser' }).first()).toBeVisible();
  });
});
