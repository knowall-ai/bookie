import { expect, test } from '@playwright/test';

/** Transfers, batch payments and purchase order statuses on the demo organisation. */
const ORG = '/portal/demo.contoso';

test.describe('Bank transfers', () => {
  test('transfer money posts after confirmation and shows in the transfers list', async ({
    page,
  }) => {
    const reference = `E2E sweep ${Date.now()}`;
    await page.goto(`${ORG}/accounting/bank`);
    await page.getByRole('link', { name: 'Transfer money' }).click();
    await expect(page.getByRole('heading', { name: 'Transfer money' })).toBeVisible();
    await page.getByTestId('transfer-from').selectOption('acc-090');
    await page.getByTestId('transfer-to').selectOption('acc-091');
    await page.getByTestId('transfer-amount').fill('125.50');
    await page.getByTestId('transfer-reference').fill(reference);
    await page.getByTestId('transfer-save').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('£125.50');
    await expect(dialog).toContainText('Business Savings Account');
    await page.getByTestId('confirm-action').click();
    await expect(page).toHaveURL(/\/accounting\/bank\/transfers$/);
    const row = page.getByRole('row', { name: new RegExp(reference) });
    await expect(row).toContainText('Business Current Account');
    await expect(row).toContainText('£125.50');
  });

  test('cancelling the confirmation writes nothing', async ({ page }) => {
    const reference = `E2E cancelled ${Date.now()}`;
    await page.goto(`${ORG}/accounting/bank/transfer`);
    await page.getByTestId('transfer-amount').fill('10');
    await page.getByTestId('transfer-reference').fill(reference);
    await page.getByTestId('transfer-save').click();
    await page.getByRole('button', { name: 'Cancel' }).first().click();
    await page.goto(`${ORG}/accounting/bank/transfers`);
    await expect(page.getByText(reference)).toHaveCount(0);
  });
});

test.describe('Batch payments', () => {
  test('pay bills from Awaiting payment, see the batch in Payments and on Home › Live', async ({
    page,
  }) => {
    await page.goto(`${ORG}/purchases/bills?status=authorised`);
    await page.getByRole('link', { name: 'Pay bills' }).click();
    await expect(page.getByRole('heading', { name: 'Pay bills' })).toBeVisible();
    const rows = page.getByTestId('batch-row');
    await expect(rows.first()).toBeVisible();
    // Select the first two payable bills.
    const boxes = page.locator('[data-testid^="batch-select-"]:not([disabled])');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await expect(page.getByTestId('batch-count')).toContainText('2 of');
    const total = (await page.getByTestId('batch-total').textContent())!.trim();
    expect(total).toMatch(/^£[\d,]+\.\d\d$/);
    await page.getByTestId('batch-bank').selectOption('acc-090');
    await page.getByTestId('batch-reference').fill('E2E BATCH');
    await page.getByTestId('batch-pay').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Pay 2 bills?');
    await expect(dialog).toContainText(total);
    await page.getByTestId('confirm-action').click();
    await expect(page).toHaveURL(/\/accounting\/payments\?status=batches$/);
    await expect(page.getByRole('tab', { name: 'Batch payments' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const row = page.getByRole('row', { name: /E2E BATCH/ }).first();
    await expect(row).toContainText('Bill payments');
    await expect(row).toContainText(total);

    // The demo books raise an INVOICE UPDATE event per paid bill, like Xero's webhooks.
    await page.goto(ORG);
    const feed = page.getByTestId('live-feed');
    await expect(feed).toBeVisible();
    await expect(feed.getByTestId('live-item').first()).toContainText(/Bill .+ updated/);
    await expect(feed.getByTestId('live-item').first()).toContainText('Paid');
  });
});

test.describe('Purchase order statuses', () => {
  test('submit, approve and mark as billed, each confirmed', async ({ page }) => {
    await page.goto(`${ORG}/purchases/orders?status=draft`);
    await page.getByRole('row').nth(1).getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: /Purchase order PO-/ })).toContainText('Draft');
    for (const [action, status] of [
      ['submitted', 'Awaiting approval'],
      ['authorised', 'Approved'],
      ['billed', 'Billed'],
    ] as const) {
      await page.getByTestId(`po-${action}`).click();
      await page.getByTestId('confirm-action').click();
      await expect(page.getByRole('heading', { name: /Purchase order PO-/ })).toContainText(status);
    }
    await expect(page.getByTestId('po-deleted')).toHaveCount(0);
  });
});
