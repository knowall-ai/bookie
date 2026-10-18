import { expect, test } from '@playwright/test';

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
    await expect(card).toContainText('Demo price (fictional)');
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
