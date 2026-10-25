import { expect, test } from '@playwright/test';

/** Read-only checks use Contoso; anything that writes uses the Wholesale demo org. */
const ORG = '/portal/demo.contoso';
const WRITE_ORG = '/portal/demo.contoso-wholesale';

async function openCheck(
  page: import('@playwright/test').Page,
  org: string,
  id: string,
  needsReview = false
) {
  await page.goto(`${org}/email`);
  await page.getByRole('tab', { name: needsReview ? /Needs review/ : /accounts@ inbox/ }).click();
  await page.locator(`a[href$="/check/${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/email/check/${id}$`));
}

test.describe('accounts inbox', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async ({ request }) => {
    expect((await request.post('/api/demo/reset')).status()).toBe(204);
  });
  test('opens invoice checks from the Email capture mailbox', async ({ page }) => {
    await openCheck(page, ORG, 'demo-mail-in-books');
    await expect(page.getByText('Already in the books').first()).toBeVisible();
    await page.getByRole('link', { name: 'Email', exact: true }).click();
    await expect(page).toHaveURL(/email\?status=mb-0$/);
    await page.getByRole('tab', { name: /Enquiries/ }).click();
    await expect(page.getByRole('link', { name: 'Bookie suggests' })).toHaveCount(0);
    await page.getByRole('tab', { name: /Captured/ }).click();
    await expect(page.getByRole('link', { name: 'Bookie suggests' })).toHaveCount(0);
  });

  test('a suspicious email shows the evidence and never its attachment', async ({ page }) => {
    await openCheck(page, ORG, 'demo-mail-lookalike');
    await expect(page.getByTestId('suspicious-warning')).toContainText('DMARC fail');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByTestId('proposed-bill')).toHaveCount(0);
    const file = await page.request.get(
      '/api/orgs/demo.contoso/accounts-inbox/demo-mail-lookalike/att-1'
    );
    expect(file.status()).toBe(403);
  });

  test('changed bank details are a warning with no update button', async ({ page }) => {
    await openCheck(page, ORG, 'demo-mail-bank-changed');
    await expect(page.getByTestId('suspicious-warning')).toContainText(
      'verify by phone using a number you already hold'
    );
    await expect(page.getByTestId('update-supplier')).toHaveCount(0);
    await expect(page.getByTestId('proposed-bill')).toHaveCount(0);
  });

  test('a changed address is proposed old → new, and updated only after confirming', async ({
    page,
  }) => {
    await openCheck(page, WRITE_ORG, 'demo-mail-address-changed');
    const differs = page.getByTestId('supplier-differs');
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
    await openCheck(page, WRITE_ORG, 'demo-mail-new');
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
    await openCheck(page, WRITE_ORG, 'demo-mail-new');
    await expect(page.getByText('Already in the books').first()).toBeVisible();
  });

  test('a new supplier is added only after its own confirmation, without bank details', async ({
    page,
  }) => {
    await openCheck(page, WRITE_ORG, 'demo-mail-new-supplier', true);
    const add = page.getByTestId('add-supplier');
    const panel = page.getByTestId('supplier-panel');
    await expect(panel).toContainText('New supplier');
    await expect(panel).toContainText('Wingtip Office Supplies Ltd');
    await expect(panel).toContainText('(from the PDF)');
    await expect(panel).not.toContainText('41009999');
    await expect(panel).toContainText('Only from an email Exchange verified');
    await expect(panel).not.toContainText('orders@wingtip.example');
    await expect(panel).not.toContainText('0113 496 0142');
    await expect(panel).toContainText('09990142');
    await add.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Add this supplier?');
    await expect(dialog).toContainText('no bank details');
    await dialog.getByTestId('confirm-action').click();
    await expect(page.getByText('Added Wingtip Office Supplies Ltd as a supplier')).toBeVisible();
    await expect(panel).toContainText('Supplier: Wingtip Office Supplies Ltd');
    await expect(page.getByTestId('editor-contact')).toHaveValue(/.+/);
  });

  test('Settings shows the accounts mailbox', async ({ page }) => {
    await page.goto('/portal/settings');
    await expect(page.getByTestId('mailbox-card').first()).toContainText(
      'accounts@contoso.example'
    );
  });
});
