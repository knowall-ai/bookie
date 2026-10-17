import { expect, test, type Page } from '@playwright/test';

/** Read-only checks use Contoso; anything that writes uses the Wholesale demo org. */
const ORG = '/portal/demo.contoso';
const WRITE_ORG = '/portal/demo.contoso-wholesale';

/** Open the first approved (awaiting payment) sales invoice; returns its contact's name. */
async function openApprovedInvoice(page: Page, org: string) {
  await page.goto(`${org}/sales/invoices?status=authorised`);
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  const contact = (await row.locator('td').nth(2).innerText()).trim();
  await row.locator('a').first().click();
  await expect(page.getByRole('heading', { name: /^Invoice / })).toBeVisible();
  return contact;
}

test.describe('history and notes', () => {
  test('invoice history lists events and takes a note', async ({ page }) => {
    await openApprovedInvoice(page, WRITE_ORG);
    const panel = page.getByTestId('history-panel');
    await expect(panel.getByRole('heading', { name: 'History and notes' })).toBeVisible();
    await expect(panel.getByTestId('history-record').first()).toBeVisible();
    await panel.getByTestId('add-note').click();
    const note = `Chased by phone ${Date.now()}`;
    await panel.getByTestId('note-text').fill(note);
    await panel.getByTestId('save-note').click();
    await expect(panel.getByText(note)).toBeVisible();
  });

  test('quotes and contacts show their history', async ({ page }) => {
    await page.goto(`${ORG}/sales/quotes?status=sent`);
    await page.locator('tbody tr a').first().click();
    await expect(page.getByTestId('history-panel').getByText('Created')).toBeVisible();

    await page.goto(`${ORG}/contacts`);
    await page.locator('tbody tr a').first().click();
    await expect(
      page.getByTestId('history-panel').getByRole('heading', { name: 'History and notes' })
    ).toBeVisible();
  });
});

test.describe('invoice extras', () => {
  test('mark an approved invoice as sent and copy its online link', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openApprovedInvoice(page, WRITE_ORG);
    await page.getByTestId('copy-online-link').click();
    await expect(page.getByTestId('online-link')).toHaveValue(
      /^https:\/\/invoices\.example\.com\//
    );

    const markSent = page.getByRole('button', { name: 'Mark as sent' });
    if (await markSent.isVisible()) {
      await markSent.click();
      await page.getByTestId('confirm-action').click();
      await expect(page.getByText('Sent', { exact: true })).toBeVisible();
      await expect(markSent).toBeHidden();
    }
  });

  test('the invoice editor offers a branding theme when there is a choice', async ({ page }) => {
    await page.goto(`${ORG}/sales/invoices/new`);
    await expect(page.getByLabel('Branding theme')).toBeVisible();
    await expect(page.getByTestId('editor-theme').locator('option')).toHaveText([
      'Default',
      'Standard',
      'Wholesale price list',
    ]);
  });
});

test.describe('credit notes', () => {
  test('create, approve and allocate a credit note to an outstanding invoice', async ({ page }) => {
    const contact = await openApprovedInvoice(page, WRITE_ORG);

    await page.goto(`${WRITE_ORG}/sales/credit-notes`);
    await page.getByRole('link', { name: 'New credit note' }).first().click();
    await page.getByTestId('editor-contact').selectOption({ label: contact });
    await page.getByTestId('line-0-description').fill('Short delivery: 1 bag');
    await page.getByTestId('line-0-price').fill('5');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /^Credit note CN-/ })).toBeVisible();
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Approve' }).click();
    await page.getByTestId('confirm-action').click();
    const panel = page.getByTestId('allocate-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('£6.00 remaining')).toBeVisible();

    await panel.getByTestId('allocate-invoice').selectOption({ index: 1 });
    await panel.getByTestId('allocate-amount').fill('2.50');
    await panel.getByTestId('allocate-submit').click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('allocations')).toContainText('2.50');
    await expect(panel.getByText('£3.50 remaining')).toBeVisible();
    await expect(
      page.getByTestId('history-panel').getByRole('cell', { name: 'Applied', exact: true })
    ).toBeVisible();
  });

  test('an invoice shows the contact’s unallocated credit with an Allocate link', async ({
    page,
  }) => {
    await page.goto(`${ORG}/sales/credit-notes?status=authorised`);
    const row = page.locator('tbody tr').first();
    const contact = (await row.locator('td').nth(2).innerText()).trim();
    await page.goto(
      `${ORG}/sales/invoices?status=authorised&search=${encodeURIComponent(contact)}`
    );
    await page.locator('tbody tr a').first().click();
    const credit = page.getByTestId('available-credit');
    await expect(credit).toContainText('unallocated credit');
    await credit.getByRole('link', { name: 'Allocate' }).first().click();
    await expect(page).toHaveURL(/\/sales\/credit-notes\/[^?]+\?allocate=/);
    await expect(page.getByTestId('allocate-invoice')).not.toHaveValue('');
  });

  test('a draft credit note can be edited and deleted', async ({ page }) => {
    await page.goto(`${WRITE_ORG}/sales/credit-notes/new`);
    await page.getByTestId('editor-contact').selectOption({ index: 1 });
    await page.getByTestId('line-0-description').fill('Returned grinder burr');
    await page.getByTestId('line-0-price').fill('8');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /^Credit note / })).toBeVisible();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Edit credit note/ })).toBeVisible();
    await page.getByTestId('line-0-price').fill('3');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /^Credit note / })).toBeVisible();
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page).toHaveURL(/\/sales\/credit-notes$/);
  });
});

test.describe('quote flow', () => {
  test('save and mark as sent, accept, invoice, and see the invoice on the quote', async ({
    page,
  }) => {
    await page.goto(`${WRITE_ORG}/sales/quotes/new`);
    await page.getByTestId('editor-contact').selectOption({ index: 1 });
    await page.getByLabel('Title').fill('Monthly beans subscription');
    await page.getByTestId('line-0-description').fill('House blend 1kg');
    await page.getByTestId('line-0-price').fill('20');
    await page.getByTestId('save-approve').click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByRole('heading', { name: /^Quote QU-/ })).toBeVisible();
    await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();
    const quoteUrl = page.url();

    await page.getByRole('button', { name: 'Mark as accepted' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Create invoice' }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByRole('heading', { name: /^Invoice / })).toBeVisible();
    await expect(page.getByTestId('history-panel')).toContainText('Converted from quote');

    await page.goto(quoteUrl);
    await expect(page.getByText('Invoiced', { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('quote-invoices')).toBeVisible();
    const history = page.getByTestId('history-panel');
    await expect(history.getByText('Invoiced', { exact: true })).toBeVisible();
    await expect(history.getByText('Accepted', { exact: true })).toBeVisible();
  });
});
