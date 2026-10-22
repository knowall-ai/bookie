import { expect, test } from '@playwright/test';

/**
 * Bookie's emails on the demo organisation: sample held emails and accounts-inbox
 * mail (lib/email/demo.ts). Demo decisions live in a browser cookie, so every test
 * starts with both sample emails pending, however often the suite runs.
 */
const PAGE = '/portal/demo.contoso/email';

test.describe('Bookie’s emails', () => {
  test('opens from the Email tab and lists held emails, pending first', async ({ page }) => {
    await page.goto('/portal/demo.contoso');
    const nav = page.getByRole('navigation', { name: 'Main', exact: true });
    await expect(nav.getByLabel('2 emails waiting for your approval')).toBeVisible();
    await nav.getByRole('link', { name: /Email/ }).click();
    await expect(page).toHaveURL(/\/portal\/demo\.contoso\/email$/);
    await expect(page.getByRole('heading', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Approvals/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const pending = page.getByRole('list', { name: 'Awaiting approval' });
    await expect(pending.getByTestId('approval-row').first()).toContainText(
      'RE: Missing invoice for October beans'
    );
    await expect(page.getByText(/Recent \(2\)/)).toBeVisible();
  });

  test('opens a held email and approves it after confirming', async ({ page }) => {
    await page.goto(PAGE);
    const row = page
      .getByTestId('approval-row')
      .filter({ hasText: 'Invoice INV-0041 is now overdue' });
    await row.getByRole('button', { name: /Invoice INV-0041/ }).click();
    await expect(row.getByTestId('approval-email')).toContainText('sam.ortiz@example.org');

    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('can’t be undone');
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Approved. Exchange is sending the email.')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Awaiting approval' }).getByText('Invoice INV-0041')
    ).toHaveCount(0);
  });

  test('rejecting needs a reason', async ({ page }) => {
    await page.goto(PAGE);
    const row = page
      .getByTestId('approval-row')
      .filter({ hasText: 'RE: Missing invoice for October beans' });
    await row.getByRole('button', { name: 'Reject' }).click();
    const reject = row.getByTestId('confirm-reject');
    await expect(reject).toBeDisabled();
    await row.getByRole('textbox').fill('Ask for the delivery note number too.');
    await reject.click();
    await expect(page.getByText('Rejected. Bookie will get your reason.')).toBeVisible();
  });

  test('shows the accounts inbox and bill capture folders', async ({ page }) => {
    await page.goto(PAGE);
    await page.getByRole('tab', { name: /accounts@ inbox/ }).click();
    await expect(page).toHaveURL(/status=inbox/);
    await expect(page.getByTestId('mailbox-message').first()).toContainText(
      'Invoice 7781 from Northwind Packaging'
    );
    await page.getByRole('tab', { name: /Needs review/ }).click();
    await expect(page).toHaveURL(/status=needs-review/);
    await expect(page.getByTestId('mailbox-message')).toContainText('Tailspin Roastery Supplies');
    await page.getByRole('tab', { name: /Captured/ }).click();
    await expect(page).toHaveURL(/status=captured/);
    await expect(page.getByTestId('mailbox-message')).toHaveCount(2);
  });

  test('Settings has Bookie’s email addresses', async ({ page }) => {
    await page.goto('/portal/settings#email');
    await expect(page.getByLabel('Bookie’s email address')).toHaveValue('bookie@contoso.example');
    await expect(page.getByLabel('Accounts mailbox')).toHaveValue('accounts@contoso.example');
  });
});

test('the previous emails address redirects into the first organisation', async ({ page }) => {
  await page.goto('/portal/emails');
  await expect(page).toHaveURL('/portal/demo.contoso/email');
});
