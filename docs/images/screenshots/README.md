# Screenshots

Real Bookie pages, used by the repository README, the docs and the public website (`web/public/screenshots/` holds 1280px copies of some of them).

Every portal screenshot comes from **Microsoft's CRONUS sample company** in a Business Central **Sandbox** environment, read live through Bookie's own connector code. There is no dummy data and no client data. Never capture a real organisation for this folder.

| File | What it shows |
|---|---|
| `home.webp` | Home dashboard: organisation activity heatmap, bank accounts with balances and items to reconcile |
| `home-mobile.webp` | Home on a 390x844 phone |
| `sales-invoices.webp` | Sales › Invoices list with Xero's status tabs, paid and due |
| `invoice-detail.webp` | A paid sales invoice: line, totals, payments, attachments |
| `quotes.webp` | Sales › Quotes list |
| `purchases-bills.webp` | Purchases › Bills list with overdue, draft and paid bills |
| `contacts.webp` | Contacts list with what you owe and what they owe |
| `contact-detail.webp` | The customer that owes the most: balance, overdue, latest invoices |
| `reports.webp` | Reporting › All reports, with the note on what Business Central can't provide |
| `profit-and-loss.webp` | Profit and loss for the previous calendar year (CRONUS's postings are mostly there) |
| `balance-sheet.webp` | Balance sheet as at today |
| `aged-receivables.webp` | Aged receivables summary |
| `chart-of-accounts.webp` | Accounting › Chart of accounts |
| `settings.webp` | Settings: the Xero and Business Central connector switches (the lists of connected organisations and the storage note are removed before the shot, as they name the signed-in user's organisations and tenant) |
| `ask-bookie.webp` | Ask Bookie panel with his real answer to "Who owes us the most, and how late are they?" |
| `landing.webp` | The public website hero at getbook.ie |
| `bitcoin-wallet.webp` | A Bitcoin wallet as a bank account. The one exception to CRONUS: it is the **demo organisation's fictional wallet** (`BOOKIE_DEV_AUTH=demo`), because a real wallet would publish its transactions; every transaction id, amount and price in it is made up and labelled so |

## Regenerating

1. Run Bookie signed in as a user who can reach the CRONUS company in a BC Sandbox, with Azure OpenAI configured in `web/.env.local` (for Ask Bookie):

   ```bash
   cd web
   BOOKIE_DEV_AUTH=azure-cli bun run dev
   ```

2. Find the CRONUS org key (`bc.Sandbox.<companyId>`) on `/portal`.

3. From the repository root:

   ```bash
   ORG=bc.Sandbox.<companyId> BASE_URL=http://localhost:3103 node web/scripts/capture-screenshots.mjs
   ```

   Pages are shot at 1440x900 (2x) and saved as 1600px-wide WebP under ~350KB. Optional: `ONLY=home,ask-bookie` retakes some shots, `OUT=/tmp/shots` writes elsewhere (recommended, so you can review before copying), `PNL_FROM`/`PNL_TO` change the profit and loss period, `INVOICE_ROW`/`CONTACT_ROW` choose which list row to open.

4. Open every image and check it shows only CRONUS, the public site, or connector switches. Delete anything doubtful. Then refresh the website copies in `web/public/screenshots/` (1280px wide).
