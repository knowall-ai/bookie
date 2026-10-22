import { expect, test } from '@playwright/test';

// These tests share tenant settings; the server override must not race wallet scans.
test.describe.configure({ mode: 'default' });

/**
 * Bitcoin wallets on the demo organisation (BOOKIE_DEV_AUTH=demo). The demo wallet is
 * fictional fixture data; the wallet added here is the public BIP84 test vector key.
 * No Electrum server is configured for e2e, so a live wallet shows nothing.
 */
const ORG = '/portal/demo.contoso';
const BIP84_XPUB =
  'xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V';

test.describe('Bitcoin wallets', () => {
  test('shows the demo wallet as a bank account with BTC and base-currency balances', async ({
    page,
  }) => {
    await page.goto(`${ORG}/accounting/bank`);
    await expect(page.getByRole('heading', { name: 'Bitcoin wallets' })).toBeVisible();
    const card = page.getByRole('article', { name: 'Contoso Treasury' });
    await expect(card.getByTestId('wallet-balance')).toContainText('0.18646400 BTC');
    await expect(card.getByTestId('wallet-balance')).toContainText('+0.00100000 BTC pending');
    await expect(card.getByTestId('wallet-chart')).toBeVisible();
    await expect(card.getByTestId('wallet-checked')).toContainText('Last checked');
    await expect(card.getByTestId('wallet-checked')).toContainText('block 919,400');
  });

  test('toggles between BTC and the base currency, and remembers the choice', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank`);
    const card = page.getByRole('article', { name: 'Contoso Treasury' });
    await expect(card.getByTestId('unit-btc')).toHaveAttribute('aria-pressed', 'true');
    await card.getByTestId('unit-fiat').click();
    await expect(card.getByTestId('unit-fiat')).toHaveText('GBP');
    // 0.186464 BTC × £52,000 (fictional) = £9,696.13, labelled with its source.
    await expect(card.getByTestId('wallet-balance')).toContainText('£9,696.13');
    await expect(card.getByTestId('wallet-balance')).toContainText('Demo price (fictional)');
    await expect(card.getByTestId('wallet-checked')).toContainText('demo price (fictional)');

    // Remembered in this browser: the wallet page opens in GBP too.
    await card.getByRole('link', { name: 'Wallet transactions' }).click();
    const summary = page.getByTestId('wallet-summary');
    await expect(summary.getByTestId('unit-fiat')).toHaveAttribute('aria-pressed', 'true');
    await expect(summary.getByTestId('wallet-balance')).toContainText('£9,696.13');
    await summary.getByTestId('unit-btc').click();
    await expect(summary.getByTestId('wallet-balance')).toContainText('0.18646400 BTC');
    await page.reload();
    await expect(page.getByTestId('wallet-summary').getByTestId('unit-btc')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  test('lists wallet transactions; pending ones have no value', async ({ page }) => {
    await page.goto(`${ORG}/accounting/bank`);
    await page
      .getByRole('article', { name: 'Contoso Treasury' })
      .getByRole('link', { name: 'Wallet transactions' })
      .click();
    await expect(page.getByRole('heading', { name: 'Contoso Treasury', level: 1 })).toBeVisible();
    for (const column of [
      'Date',
      'Transaction',
      'Confirmations',
      'Fee',
      'Amount',
      'Value in GBP',
    ]) {
      await expect(page.getByRole('columnheader', { name: column })).toBeVisible();
    }
    const rows = page.getByRole('row');
    await expect(rows).toHaveCount(7);
    const pending = rows.filter({ hasText: 'Pending' });
    await expect(pending).toContainText('+0.00100000 BTC');
    await expect(pending.getByTitle(/Pending: it has no block time yet/)).toBeVisible();
    const sent = rows.filter({ hasText: '−0.03001500 BTC' });
    await expect(sent).toContainText('0.00001500 BTC');
    await expect(sent).toContainText('Demo price (fictional), 2 Oct 2026');
    await expect(page.getByTestId('wallet-summary')).toContainText('0.18646400 BTC');
  });

  test('a member adds and removes a wallet in settings; without Electrum it shows nothing', async ({
    page,
  }) => {
    // A random key origin makes the descriptor unique, so reruns never collide.
    const fingerprint = Date.now().toString(16).slice(-8).padStart(8, '0');
    const name = `E2E wallet ${fingerprint}`;
    await page.goto('/portal/settings');
    const section = page.getByTestId('bitcoin-wallets');
    await expect(section.getByTestId('electrum-missing')).toContainText(
      'No Electrum server configured'
    );
    // Business Central wallets live on the BC bank account, so Settings says so.
    await expect(section.getByTestId('bitcoin-bc-note')).toContainText('Business Central');
    await section.getByTestId('add-bitcoin-wallet').click();
    await section.getByLabel('Name').fill(name);
    await section.getByLabel('Organisation').selectOption('demo.contoso');
    await section
      .getByLabel('Extended public key or output descriptor')
      .fill(`wpkh([${fingerprint}/84h/0h/0h]${BIP84_XPUB}/<0;1>/*)`);
    await section.getByRole('button', { name: 'Add wallet' }).click();
    const item = section
      .getByTestId('bitcoin-wallet-list')
      .getByRole('listitem')
      .filter({ hasText: name });
    await expect(item).toContainText('Native SegWit (P2WPKH)');
    // The key is never shown again.
    await expect(section).not.toContainText(BIP84_XPUB.slice(0, 20));

    await page.goto(`${ORG}/accounting/bank`);
    const card = page.getByRole('article', { name });
    await expect(card.getByTestId('wallet-unavailable')).toHaveText(
      'No Electrum server configured'
    );

    await page.goto('/portal/settings');
    await page.getByRole('button', { name: `Remove ${name}` }).click();
    await page.getByTestId('confirm-action').click();
    await expect(page.getByTestId('bitcoin-wallet-list')).not.toContainText(name);
  });

  test('shows a receive QR code with a fresh address, and adds an amount', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`${ORG}/accounting/bank`);
    await page
      .getByRole('article', { name: 'Contoso Treasury' })
      .getByRole('link', { name: 'Wallet transactions' })
      .click();
    await page.getByTestId('wallet-receive').click();

    const dialog = page.getByRole('dialog', { name: 'Receive bitcoin' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('receive-network')).toHaveText('Bitcoin mainnet');
    await expect(dialog.getByTestId('receive-demo-note')).toContainText('Never send real bitcoin');

    const address = dialog.getByTestId('receive-address');
    await expect(address).toHaveText(/^bc1q[02-9ac-hj-np-z]{38}$/);
    const text = (await address.textContent())!;
    await expect(
      dialog.getByRole('img', { name: `QR code for the address ${text}` })
    ).toBeVisible();
    const qr = dialog.getByTestId('receive-qr');
    await expect(qr.locator('svg')).toBeVisible();
    await expect(qr).toHaveAttribute('data-uri', `bitcoin:${text}`);
    await expect(dialog).toContainText('Each payment should use a fresh address');

    await dialog.getByRole('button', { name: 'Copy address' }).click();
    await expect(dialog.getByTestId('receive-copy')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

    await dialog.getByLabel('Amount (BTC, optional)').fill('0.0015000');
    await expect(qr).toHaveAttribute('data-uri', `bitcoin:${text}?amount=0.0015`);
    await expect(qr).toHaveAccessibleName(`QR code: pay 0.0015 BTC to ${text}`);
    await expect(dialog.getByTestId('receive-qr-caption')).toHaveText('Asks for 0.0015 BTC');

    await dialog.getByLabel('Amount (BTC, optional)').fill('0.000000001');
    await expect(dialog).toContainText('BTC has at most 8 decimal places.');
    // Never a code for a different amount than the one typed.
    await expect(qr).toBeHidden();
    await expect(dialog.getByTestId('receive-qr-hidden')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('wallet-receive')).toBeFocused();
  });

  test('refuses a private key', async ({ page }) => {
    await page.goto('/portal/settings');
    const section = page.getByTestId('bitcoin-wallets');
    await section.getByTestId('add-bitcoin-wallet').click();
    await section.getByLabel('Name').fill('Should fail');
    await section
      .getByLabel('Extended public key or output descriptor')
      .fill(
        'xprv9s21ZrQH143K3GJpoapnV8SFfukcVBSfeCficPSGfubmSFDxo1kuHnLisriDvSnRRuL2Qrg5ggqHKNVpxR86QEC8w35uxmGoggxtQTPvfUu'
      );
    await section.getByRole('button', { name: 'Add wallet' }).click();
    await expect(page.getByText(/That is a private key/)).toBeVisible();
  });
});

test('a member configures and clears the tenant Electrum server', async ({ page }) => {
  await page.goto('/portal/settings');
  const section = page.getByTestId('electrum-server');
  await expect(section.getByRole('heading', { name: 'Electrum server' })).toBeVisible();
  await section.getByLabel('Server URL').fill('tcp://x:1');
  await section.getByRole('button', { name: 'Test and save' }).click();
  await expect(
    page.getByText(
      "Use an ssl:// address: Bookie only connects to an organisation's own server over TLS."
    )
  ).toBeVisible();
  await section.getByLabel('Server URL').fill('ssl://electrum.example.com:50002');
  await section.getByRole('switch', { name: 'I run this server (no privacy warning)' }).click();
  await section.getByRole('button', { name: 'Test and save' }).click();
  try {
    await expect(section).toContainText('Your server: ssl://electrum.example.com:50002');
    await expect(section).toContainText('You run it');
    await expect(page.getByTestId('electrum-privacy')).toBeHidden();
  } finally {
    await section.getByRole('button', { name: "Use the installation's server" }).click();
  }
  await expect(section).toContainText("This Bookie installation's server");
  await expect(section.getByRole('button', { name: "Use the installation's server" })).toBeHidden();
  await expect(page.getByTestId('electrum-missing')).toBeVisible();
});
