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
    await expect(
      nav.getByRole('link', { name: /^Email\W+2 waiting for your approval$/ })
    ).toBeVisible();
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
    await expect(page).toHaveURL(/status=mb-0/);
    await expect(page.getByTestId('mailbox-message').first()).toContainText(
      'URGENT: overdue invoice CP-7781'
    );
    await page.getByRole('tab', { name: /Enquiries \(hello@ inbox\)/ }).click();
    await expect(page).toHaveURL(/status=mb-1/);
    await expect(page.getByTestId('mailbox-message')).toHaveCount(2);
    await expect(page.getByTestId('mailbox-message').first()).toContainText(
      'Fabrikam wholesale enquiry'
    );
    await expect(page.getByTestId('mailbox-message').last()).toContainText(
      'Northwind delivery enquiry'
    );
    await page.getByRole('tab', { name: /Needs review/ }).click();
    await expect(page).toHaveURL(/status=needs-review/);
    await expect(page.getByTestId('mailbox-message')).toContainText('Wingtip');
    await page.getByRole('tab', { name: /Captured/ }).click();
    await expect(page).toHaveURL(/status=captured/);
    await expect(page.getByTestId('mailbox-message')).toHaveCount(2);
  });

  test('Settings has Bookie’s email addresses', async ({ page }) => {
    await page.goto('/portal/settings#email');
    const agent = page.getByTestId('agent-card');
    await expect(agent).toHaveCount(1);
    await expect(agent).toContainText('bookie@contoso.example');
    await expect(page.getByLabel('Agent 1 name')).toHaveValue('Bookie');
    await expect(page.getByLabel('Agent 1 Teams user (optional)')).toHaveCount(0);
    const mailboxes = page.getByTestId('mailbox-card');
    await expect(mailboxes.nth(0)).toContainText('accounts@contoso.example');
    await expect(mailboxes.nth(1)).toContainText('hello@contoso.example');
    await expect(page.getByLabel('Mailbox 1 agent')).toHaveValue('bookie');
    await expect(page.getByLabel('Mailbox 2 agent')).toHaveValue('');
    const capture = page.getByRole('switch', { name: /Bill capture for/ });
    await expect(capture.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(capture.nth(1)).toHaveAttribute('aria-checked', 'false');
  });

  test('Settings adds a mailbox from the directory, with one bill capture mailbox', async ({
    page,
  }) => {
    await page.goto('/portal/settings#email');
    const save = page.locator('#email').getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await page.getByTestId('mailbox-picker').getByRole('combobox').fill('Priya');
    await page.getByRole('option', { name: /priya\.shah@contoso\.example/ }).click();
    const added = page.getByTestId('mailbox-card').nth(2);
    await expect(added).toContainText('priya.shah@contoso.example');
    await expect(page.getByLabel('Mailbox 3 tab name')).toHaveValue('Priya Shah');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expect(save).toBeEnabled();

    // Bill capture moves: turning it on for one mailbox turns it off for the others.
    const capture = page.getByRole('switch', { name: /Bill capture for/ });
    await capture.nth(2).click();
    await expect(capture.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(capture.nth(0)).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Remove priya.shah@contoso.example' }).click();
    await expect(page.getByTestId('mailbox-card')).toHaveCount(2);
  });

  test('Settings refuses a typed address that is not a full email address', async ({ page }) => {
    await page.goto('/portal/settings#email');
    await page.getByRole('button', { name: 'Or type the address' }).last().click();
    await page.getByLabel('Add another shared mailbox').fill('accounts');
    await expect(
      page.getByText('Use the full address, such as accounts@yourcompany.com.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
  });
});

test('the previous emails address redirects into the first organisation', async ({ page }) => {
  await page.goto('/portal/emails');
  await expect(page).toHaveURL('/portal/demo.contoso/email');
});
