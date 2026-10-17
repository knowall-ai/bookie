import { expect, test } from '@playwright/test';

// Runs against the demo organisation (BOOKIE_DEV_AUTH=demo).
const ORG = '/portal/demo.contoso';

test.describe('Home dashboard', () => {
  test('shows bank accounts, money owed, bills, the chart and P&L', async ({ page }) => {
    await page.goto(ORG);
    await expect(page.getByRole('heading', { name: 'Contoso Coffee Roasters Ltd' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bookie’s take' })).toBeVisible();
    await expect(page.getByText('Business Current Account')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Invoices owed to you' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bills to pay' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Income and expenses' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profit and loss' })).toBeVisible();

    // The chart has a table view for screen readers and keyboard users.
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('table', { name: /Income and expenses by month/ })).toBeVisible();

    // Overdue links to the filtered invoice list.
    await page
      .getByRole('link', { name: /Overdue/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/sales\/invoices\?status=overdue/);
  });
});

test.describe('Reporting', () => {
  test('lists reports grouped like Xero', async ({ page }) => {
    await page.goto(`${ORG}/reporting`);
    await expect(page.getByRole('heading', { name: 'All reports' })).toBeVisible();
    for (const group of [
      'Financial performance',
      'Financial position',
      'Receivables and payables',
      'Bank',
    ]) {
      await expect(page.getByRole('heading', { name: group })).toBeVisible();
    }
    await page.getByRole('link', { name: /Balance sheet/ }).click();
    await expect(page).toHaveURL(/\/reporting\/balance-sheet$/);
    await expect(page.getByRole('heading', { name: 'Balance Sheet', exact: true })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: 'Total Equity' })).toBeVisible();
  });

  test('runs the P&L for a preset, compares periods and exports CSV', async ({ page }) => {
    await page.goto(`${ORG}/reporting/profit-and-loss`);
    await expect(page.getByRole('heading', { name: 'Profit and Loss', exact: true })).toBeVisible();

    await page.getByLabel('Date range').selectOption({ label: 'Last month' });
    await page.getByLabel('Compare with').selectOption('2');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page).toHaveURL(/periods=2&timeframe=month/);
    // Label column + three periods.
    await expect(page.locator('thead th')).toHaveCount(4);
    await expect(page.getByRole('rowheader', { name: 'Net Profit' })).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^profit-and-loss-\d{4}-\d{2}-\d{2}-/);
  });

  test('aged receivables shows Xero’s ageing columns', async ({ page }) => {
    await page.goto(`${ORG}/reporting/aged-receivables`);
    for (const column of ['Current', '< 1 Month', '1 Month', 'Older', 'Total']) {
      await expect(page.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
    }
  });

  test('unknown report shows not found', async ({ page }) => {
    await page.goto(`${ORG}/reporting/not-a-report`);
    await expect(page.getByText('Not found').first()).toBeVisible();
  });
});
