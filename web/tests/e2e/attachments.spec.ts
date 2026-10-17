import { expect, test, type Page } from '@playwright/test';

/** Read-only checks use Contoso; anything that writes uses the Wholesale demo org. */
const ORG = '/portal/demo.contoso';
const WRITE_ORG = '/portal/demo.contoso-wholesale';

/** A minimal one-page PDF. */
function pdf(text: string): Buffer {
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function openFirstDraftInvoice(page: Page) {
  await page.goto(`${WRITE_ORG}/sales/invoices?status=draft`);
  await page.locator('tbody tr a').first().click();
  await expect(page.getByRole('heading', { name: /^Invoice / })).toBeVisible();
}

test.describe('attachments', () => {
  test('upload a PDF to a draft invoice, preview it and download it', async ({ page }) => {
    await openFirstDraftInvoice(page);
    const card = page.getByRole('region', { name: /Attachments/ });
    await expect(card).toBeVisible();

    const name = `fabrikam-receipt-${Date.now()}.pdf`;
    await card.getByLabel('Attach files').setInputFiles({
      name,
      mimeType: 'application/pdf',
      buffer: pdf('Fabrikam receipt'),
    });
    await expect(card.getByText(name)).toBeVisible();

    // Preview: the PDF loads in an iframe through the authenticated proxy.
    const frame = card.locator('iframe');
    await expect(frame).toHaveAttribute('src', /\/api\/orgs\/.+\/attachments\/invoice\//);
    const src = (await frame.getAttribute('src'))!;
    const preview = await page.request.get(src);
    expect(preview.status()).toBe(200);
    expect(preview.headers()['content-type']).toBe('application/pdf');
    expect(preview.headers()['content-disposition']).toMatch(/^inline;/);
    expect(preview.headers()['cache-control']).toContain('no-store');

    // Download.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      card.getByRole('link', { name: `Download ${name}` }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(name);
    const bytes = await download.createReadStream().then(
      (s) =>
        new Promise<Buffer>((resolve) => {
          const chunks: Buffer[] = [];
          s.on('data', (c: Buffer) => chunks.push(c));
          s.on('end', () => resolve(Buffer.concat(chunks)));
        })
    );
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('rejects files that are not PDF, PNG or JPG', async ({ page }) => {
    await openFirstDraftInvoice(page);
    const card = page.getByRole('region', { name: /Attachments/ });
    await card.getByLabel('Attach files').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(card.getByRole('alert')).toHaveText(/isn't a PDF, PNG or JPG/);
  });

  test('the proxy refuses orgs the user cannot reach', async ({ request }) => {
    const res = await request.get('/api/orgs/xero.not-mine.at-all/attachments/bill/x/y');
    expect(res.status()).toBe(404);
  });
});

test.describe('purchases inbox', () => {
  test('lists inbox files with a preview', async ({ page }) => {
    await page.goto(`${ORG}/purchases/inbox`);
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
    const files = page.getByRole('list', { name: 'Inbox files' }).getByRole('link');
    await expect(files.first()).toBeVisible();
    await files.filter({ hasText: '.png' }).first().click();
    await expect(page.getByRole('img', { name: /Preview of .*\.png/ })).toBeVisible();
  });

  test('create a bill from an inbox file attaches the file', async ({ page }) => {
    await page.goto(`${WRITE_ORG}/purchases/inbox`);
    const first = page.getByRole('list', { name: 'Inbox files' }).getByRole('link').first();
    const fileName = (await first.locator('span span').first().innerText()).trim();
    await first.click();
    await page.getByRole('link', { name: 'Create bill from this' }).click();
    await expect(page.getByRole('heading', { name: 'New bill' })).toBeVisible();
    // The editor starts empty: the user keys the bill.
    await expect(page.getByTestId('editor-contact')).toHaveValue('');
    await page.getByTestId('editor-contact').selectOption({ index: 1 });
    await page.getByTestId('line-0-description').fill('Packaging');
    await page.getByTestId('line-0-price').fill('42');
    await page.getByTestId('save-draft').click();
    await expect(page.getByRole('heading', { name: /^Bill / })).toBeVisible();
    await expect(
      page.getByRole('region', { name: /Attachments/ }).getByText(fileName)
    ).toBeVisible();
  });

  test('bills list has a Captured by Bookie filter', async ({ page }) => {
    await page.goto(`${ORG}/purchases/bills`);
    await page.getByRole('tab', { name: 'Captured by Bookie' }).click();
    await expect(
      page.getByRole('tab', { name: 'Captured by Bookie', selected: true })
    ).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('Captured by Bookie');
  });
});
