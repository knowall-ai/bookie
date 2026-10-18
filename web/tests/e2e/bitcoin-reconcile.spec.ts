import { expect, test } from '@playwright/test';

/**
 * Reconcile the demo wallet against the demo organisation's fictional BTC bank
 * account (BOOKIE_DEV_AUTH=demo). Drafting and posting change the demo books only.
 */
const WALLET = '/portal/demo.contoso/accounting/bank/bitcoin/demo-contoso-treasury';

test.describe.serial('Bitcoin reconcile', () => {
  test('shows matched, on chain only, in the books only and pending', async ({ page }) => {
    await page.goto(WALLET);
    await page.getByRole('tab', { name: 'Reconcile' }).click();
    await expect(page).toHaveURL(/tab=reconcile/);
    await expect(page.getByTestId('rec-chain')).toContainText('0.18646400 BTC');
    await expect(page.getByTestId('rec-books')).toContainText('0.21347900 BTC');
    await expect(page.getByTestId('rec-difference')).toContainText('−0.02701500 BTC');
    await expect(page.getByTestId('rec-matched')).toContainText('3 of 6');
    await expect(page.getByTestId('matched')).toContainText('Amounts differ');
    await expect(page.getByTestId('matched')).toContainText('Amount and date');
    await expect(page.getByTestId('ledger-only')).toContainText('ADJ-0007');
    await expect(page.getByTestId('rec-pending')).toContainText('+0.00100000 BTC');
    await expect(page.getByTestId('chain-only').getByRole('row')).toHaveCount(3);
  });

  test('drafts a journal line after confirmation, then posts it after confirmation', async ({
    page,
  }) => {
    await page.goto(`${WALLET}?tab=reconcile`);
    const chainOnly = page.getByTestId('chain-only');
    // Newest first: the October receipt (money in, so no fee account needed).
    await chainOnly.getByRole('checkbox').first().check();
    await page.getByLabel('Other side of each payment or receipt').selectOption('620');
    await page.getByTestId('draft-journal').click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'Nothing is posted until you choose Post'
    );
    await page.getByTestId('confirm-action').click();

    const drafts = page.getByTestId('btc-drafts');
    await expect(drafts).toContainText('1 line');
    await expect(drafts).toContainText('+0.00450000 BTC');
    await expect(chainOnly).toContainText('Drafted');

    await drafts.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('live books');
    await page.getByTestId('confirm-action').click();

    await expect(page.getByTestId('btc-drafts')).toHaveCount(0);
    await expect(page.getByTestId('rec-matched')).toContainText('4 of 6');
    await expect(page.getByTestId('chain-only').getByRole('row')).toHaveCount(2);
  });
});
