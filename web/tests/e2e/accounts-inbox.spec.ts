import { expect, test } from '@playwright/test';

/** Read-only checks use Contoso; anything that writes uses the Wholesale demo org. */
const ORG = '/portal/demo.contoso';
const WRITE_ORG = '/portal/demo.contoso-wholesale';

const row = (page: import('@playwright/test').Page, subject: RegExp) =>
  page.getByTestId('accounts-inbox-item').filter({ hasText: subject });

test.describe('accounts inbox', () => {
  test('lists the demo mailbox with a verdict on each document', async ({ page }) => {
    await page.goto(`${ORG}/purchases/accounts-inbox`);
    await expect(page.getByRole('heading', { name: 'Accounts inbox' })).toBeVisible();
    await expect(page.getByTestId('accounts-mailbox')).toHaveText('accounts@contoso.example');
    await expect(page.getByTestId('accounts-inbox-item')).toHaveCount(7);
    await expect(page.getByTestId('accounts-inbox-summary')).toContainText('7 documents');

    const lookalike = row(page, /URGENT: overdue invoice CP-7781/);
    await expect(lookalike).toHaveAttribute('data-verdict', 'suspicious');
    await expect(lookalike).toContainText('DMARC fail');
    await expect(lookalike).toContainText('c0ho.example, which looks like coho.example');

    const inBooks = page.locator('[data-testid="accounts-inbox-item"][data-verdict="in-books"]');
    await expect(inBooks).toHaveCount(1);
    await expect(inBooks).toContainText('Already in the books');
    await expect(inBooks.getByRole('link', { name: /^Open bill / })).toHaveAttribute(
      'href',
      /\/purchases\/bills\//
    );

    const fresh = row(page, /AGB-2291/);
    await expect(fresh).toHaveAttribute('data-verdict', 'new');
    await expect(fresh).toContainText('New, ready to file');
    await expect(fresh).toContainText('Alpine Green Beans');

    await expect(row(page, /monthly statement/)).toHaveAttribute('data-verdict', 'not-invoice');
    await expect(row(page, /monthly statement/)).toContainText('Statement');

    await expect(row(page, /WOS-1042/)).toContainText('New supplier');
    await expect(row(page, /TE-55012/)).toContainText('Supplier details differ');

    const bank = row(page, /LP-2026-10/);
    await expect(bank).toHaveAttribute('data-verdict', 'suspicious');
    await expect(bank).toContainText(
      "Bank details on this invoice differ from the supplier's record"
    );
  });

  test('a suspicious email shows the evidence and never its attachment', async ({ page }) => {
    await page.goto(`${ORG}/purchases/accounts-inbox/demo-mail-lookalike/att-1`);
    await expect(page.getByTestId('suspicious-warning')).toContainText('DMARC fail');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByTestId('proposed-bill')).toHaveCount(0);
    const file = await page.request.get(
      '/api/orgs/demo.contoso/accounts-inbox/demo-mail-lookalike/att-1'
    );
    expect(file.status()).toBe(403);
  });

  test('changed bank details are a warning with no update button', async ({ page }) => {
    await page.goto(`${ORG}/purchases/accounts-inbox/demo-mail-bank-changed/att-1`);
    await expect(page.getByTestId('suspicious-warning')).toContainText(
      'verify by phone using a number you already hold'
    );
    await expect(page.getByTestId('update-supplier')).toHaveCount(0);
    await expect(page.getByTestId('proposed-bill')).toHaveCount(0);
  });

  test('a changed address is proposed old → new, and updated only after confirming', async ({
    page,
  }) => {
    await page.goto(`${WRITE_ORG}/purchases/accounts-inbox/demo-mail-address-changed/att-1`);
    const differs = page.getByTestId('supplier-differs');
    test.skip(
      (await differs.count()) === 0,
      'Already applied earlier on this dev server (demo state persists until restart).'
    );
    await expect(differs).toContainText('Unit 7 Riverside Park, Bristol, BS2 0JA');
    await page.getByTestId('diff-phone').uncheck();
    await page.getByTestId('update-supplier').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('This changes address on Trey Energy');
    await expect(dialog).toContainText('Bank details are not changed');
    await dialog.getByTestId('confirm-action').click();
    await expect(page.getByText('Updated address')).toBeVisible();
    // Only the phone is still different.
    await expect(page.getByTestId('diff-address')).toHaveCount(0);
    await expect(page.getByTestId('diff-phone')).toBeVisible();
  });

  test('create a draft bill from a new invoice, confirmed, with the PDF attached', async ({
    page,
  }) => {
    await page.goto(`${WRITE_ORG}/purchases/accounts-inbox/demo-mail-new/att-1`);
    const proposed = page.getByTestId('proposed-bill');
    test.skip(
      (await proposed.count()) === 0,
      'Already filed earlier on this dev server (demo state persists until restart).'
    );
    await expect(page.getByTestId('supplier-panel')).toContainText(
      /VAT number .+ \(from the document\) matches Alpine Green Beans/
    );
    await expect(page.getByLabel('Invoice number')).toHaveValue('AGB-2291');
    await expect(page.getByTestId('line-0-price')).toHaveValue('180');
    await expect(page.getByTestId('save-approve')).toHaveCount(0);

    await page.getByTestId('save-draft').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Create this draft bill?');
    await expect(dialog).toContainText('DRAFT bill');
    await expect(dialog).toContainText('AGB-2291.pdf attached');
    await dialog.getByTestId('confirm-action').click();

    await expect(page).toHaveURL(/\/purchases\/bills\/[^/]+$/);
    await expect(page.getByText('AGB-2291').first()).toBeVisible();
    await expect(page.getByText('Draft').first()).toBeVisible();
    await expect(page.getByText('AGB-2291.pdf')).toBeVisible();

    // Back in the inbox it is now in the books.
    await page.goto(`${WRITE_ORG}/purchases/accounts-inbox`);
    await expect(row(page, /AGB-2291/)).toHaveAttribute('data-verdict', 'in-books');
  });

  test('Settings shows the accounts mailbox', async ({ page }) => {
    await page.goto('/portal/settings');
    await expect(page.getByTestId('accounts-mailbox-input')).toHaveValue(
      'accounts@contoso.example'
    );
  });
});
