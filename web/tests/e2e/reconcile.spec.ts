import { expect, test } from '@playwright/test';

/**
 * Reconcile on the demo organisations' fictional bank feed. Viewing uses the
 * main demo org; matching (a write) uses the second one so other specs aren't
 * disturbed.
 */
const ORG = '/portal/demo.contoso';
const WHOLESALE = '/portal/demo.contoso-wholesale';

test.describe('Reconcile', () => {
  test('suggests matches with plain reasons and says when there is none', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank/acc-090`);
    await page.getByRole('link', { name: 'Reconcile', exact: true }).click();
    await expect(page).toHaveURL(/\/accounting\/bank\/acc-090\/reconcile$/);
    await expect(
      page.getByRole('heading', { name: 'Bank statement lines to reconcile' })
    ).toBeVisible();
    const lines = page.getByTestId('statement-line');
    await expect(lines.first()).toBeVisible();

    // Reasons are words, never a score.
    const reasons = page.getByTestId('reasons');
    await expect(reasons.filter({ hasText: /^same amount · description has / })).not.toHaveCount(0);
    await expect(
      reasons.filter({ hasText: /part-payment: £[\d,.]+ of £[\d,.]+ due/ })
    ).not.toHaveCount(0);
    await expect(reasons.filter({ hasText: /reference has PO \d+/ })).not.toHaveCount(0);
    await expect(reasons.filter({ hasText: /reference has BILL-\d+/ })).not.toHaveCount(0);

    // No match, a euro invoice it won't match across currencies, and a payment already recorded.
    const interest = lines.filter({ hasText: 'GROSS INTEREST' });
    await expect(interest).toContainText('No match found');
    await expect(
      lines.filter({ hasText: 'INTERNATIONAL CREDIT' }).getByTestId('other-currency')
    ).toContainText('is in EUR');
    await expect(page.getByTestId('already-recorded').first()).toContainText(
      /Payment already recorded for INV-\d+/
    );

    // Find & match from a line with no match.
    await interest.getByRole('link', { name: 'Find & match' }).click();
    await expect(page).toHaveURL(/line=sl-\d+#find$/);
    await expect(page.getByTestId('find-results')).toContainText('GROSS INTEREST');
  });

  test('Match confirms, records the payment, then shows it as already recorded', async ({
    page,
  }) => {
    await page.goto(`${WHOLESALE}/accounting/bank/acc-090/reconcile`);
    // The first line still offering a match (the server keeps demo writes until it restarts).
    const line = page
      .getByTestId('statement-line')
      .filter({ has: page.getByRole('button', { name: 'Match' }) })
      .first();
    const lineId = await line.getAttribute('data-line-id');
    const suggestion = line
      .getByTestId('suggestion')
      .filter({ has: page.getByRole('button', { name: 'Match' }) })
      .first();
    const number = (await suggestion.getByRole('link').first().textContent())!.trim();

    // Cancelling writes nothing.
    await suggestion.getByRole('button', { name: 'Match' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    await suggestion.getByRole('button', { name: 'Match' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText(`Record a payment against ${number}?`);
    await expect(dialog).toContainText('Business Current Account');
    await expect(dialog).toContainText('Reconcile screen');
    await page.getByTestId('confirm-action').click();

    const after = page.locator(`[data-line-id="${lineId}"]`);
    await expect(after.getByTestId('already-recorded')).toContainText(
      `Payment already recorded for ${number}`
    );
  });

  test('Find & match takes a line typed in', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank/acc-090/reconcile`);
    const form = page.getByRole('form', { name: 'Find and match' });
    await form.getByLabel('Money').selectOption('out');
    await form.getByLabel(/Amount/).fill('0.01');
    await form.getByLabel('Date').fill('2026-01-15');
    await form.getByRole('button', { name: 'Find' }).click();
    await expect(page).toHaveURL(/direction=out/);
    await expect(page.getByTestId('find-results').getByTestId('suggestion').first()).toBeVisible();
  });
});
