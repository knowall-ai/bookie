import { expect, test, type Page } from '@playwright/test';

// Runs against the demo organisations (BOOKIE_DEV_AUTH=demo). Planned items are
// written on Contoso Wholesale only, so the other tests see an unchanged forecast.
const ORG = '/portal/demo.contoso';
const WHOLESALE = '/portal/demo.contoso-wholesale';
const PAGE = '/reporting/cash-flow-forecast';

const money = (text: string) => Number(text.replace(/[^0-9.-]/g, ''));

async function lowest(page: Page) {
  const callout = page.getByTestId('forecast-lowest');
  await expect(callout).toHaveText(/Lowest balance\s*-?£[\d,]+\.\d{2}\s*in week of \d{1,2} \w{3}/);
  return money((await callout.locator('span.num').textContent()) ?? '');
}

test.describe('Cash flow forecast', () => {
  test('opens from Home and shows the 13-week forecast with its layers', async ({ page }) => {
    await page.goto(ORG);
    await page.getByTestId('home-forecast-link').click();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    await expect(page.getByRole('heading', { name: 'Cash flow forecast' })).toBeVisible();
    await expect(page.getByTestId('forecast-chart')).toBeVisible();
    await expect(page.getByTestId('forecast-opening')).toContainText('From 2 bank accounts');
    await lowest(page);

    // Overdue is kept apart, with links to the lists.
    const overdue = page.getByTestId('forecast-overdue');
    await expect(overdue).toContainText('Overdue: timing unknown');
    await overdue.getByRole('link', { name: /View overdue invoices/ }).click();
    await expect(page).toHaveURL(/\/sales\/invoices\?status=overdue/);
  });

  test('drills from a table cell to the invoices behind it', async ({ page }) => {
    await page.goto(`${ORG}${PAGE}`);
    const table = page.getByTestId('forecast-table');
    await expect(table.getByRole('rowheader', { name: 'Known in' })).toBeVisible();
    await expect(table.getByRole('rowheader', { name: 'Drafts in' })).toHaveCount(0);
    await table.getByRole('button', { name: /^Known in, the whole period/ }).click();
    const drill = page.getByTestId('forecast-drilldown');
    await expect(drill.getByRole('link', { name: /^INV-/ }).first()).toBeVisible();
    await drill.getByRole('link', { name: /^INV-/ }).first().click();
    await expect(page).toHaveURL(/\/sales\/invoices\/inv-/);
  });

  test('adds a planned item and shows it in the table and chart', async ({ page }) => {
    await page.goto(`${WHOLESALE}${PAGE}`);
    const planned = page.getByTestId('planned-items');
    // Leftovers from an interrupted run would skew the numbers.
    const leftovers = planned.getByRole('button', { name: /^Delete E2E new roaster/ });
    while ((await leftovers.count()) > 0) {
      const count = await leftovers.count();
      await leftovers.first().click();
      await page.getByTestId('confirm-action').click();
      await expect(leftovers).toHaveCount(count - 1);
    }
    const before = await lowest(page);
    const description = `E2E new roaster ${Date.now().toString(36)}`;
    const due = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);

    await page.getByRole('button', { name: 'Add planned item' }).click();
    const form = page.getByTestId('planned-form');
    await form.getByLabel('Description').fill(description);
    await form.getByLabel('Money').selectOption('out');
    await form.getByLabel('Amount', { exact: true }).fill('250000');
    await form.getByLabel('Date').fill(due);
    await form.getByRole('button', { name: 'Add item' }).click();

    await expect(planned.getByText(description)).toBeVisible();
    // In the table, under "Planned out", as money out.
    const table = page.getByTestId('forecast-table');
    const cell = table.getByRole('button', { name: /^Planned out, Week of/ }).first();
    await expect(cell).toContainText('-£250,000.00');
    await cell.click();
    const drill = page.getByTestId('forecast-drilldown');
    await expect(drill).toContainText(description);
    await expect(drill).toContainText('-£250,000.00');
    // In the chart: an outlined (planned) bar, and the lowest point drops below zero.
    await expect(
      page.getByTestId('forecast-chart').locator('.recharts-bar-rectangle path[stroke="#d95926"]')
    ).not.toHaveCount(0);
    expect(await lowest(page)).toBeLessThan(Math.min(before, 0));
    await expect(page.getByTestId('forecast-lowest')).toContainText('-£');

    // Clean up.
    await planned.getByRole('button', { name: `Delete ${description}` }).click();
    await page.getByTestId('confirm-action').click();
    await expect(planned.getByText(description)).toHaveCount(0);
  });

  test('projection is off by default and adds a labelled layer when switched on', async ({
    page,
  }) => {
    await page.goto(`${ORG}${PAGE}`);
    const before = await lowest(page);
    const projection = page.getByTestId('forecast-projection');
    await expect(projection).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('forecast-table').getByText('Projected out')).toHaveCount(0);

    await projection.click();
    await expect(page).toHaveURL(/projection=3/);
    await expect(projection).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByLabel('Legend')).toContainText(
      /Projection: average of \w{3} to \w{3} \d{4}/
    );
    await expect(
      page.getByTestId('forecast-table').getByRole('rowheader', { name: 'Projected out' })
    ).toBeVisible();
    // The lowest point is computed only from the layers that are on, so it moves.
    await expect.poll(() => lowest(page)).not.toBe(before);

    await page
      .getByTestId('forecast-projection-months')
      .getByRole('button', { name: '12' })
      .click();
    await expect(page).toHaveURL(/projection=12/);
  });

  test('switches horizon and currency, and exports CSV', async ({ page }) => {
    await page.goto(`${ORG}${PAGE}`);
    await page.getByTestId('forecast-horizon').getByRole('button', { name: '6 months' }).click();
    await expect(page).toHaveURL(/horizon=6m/);
    await expect(page.getByTestId('forecast-lowest')).toHaveText(/in \w{3} \d{4}/);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^cash-flow-forecast-.*-GBP-6m-.*\.csv$/);

    await page.getByTestId('forecast-currency').getByRole('button', { name: 'EUR' }).click();
    await expect(page).toHaveURL(/currency=EUR/);
    // No euro bank account: no opening balance, said plainly rather than shown as zero.
    await expect(page.getByText(/No running balance/)).toBeVisible();
  });
});
