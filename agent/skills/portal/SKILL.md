---
name: portal
description: Point people to the right page in the Bookie portal (bookie.knowall.ai/portal) - the invoice, the bill, the report or the screen where they can do the thing themselves. Use whenever an answer would be easier to act on in the portal, when someone asks "where do I...", or to link a bill bill-capture drafted.
version: 0.1.0
metadata:
  hermes:
    tags: [portal, links, navigation]
    category: finance
---

# Portal links

The Bookie portal is the same books in a Xero-style web app, behind the person's own Microsoft sign-in.
Base URL: `PORTAL_BASE_URL` (`https://bookie.knowall.ai/portal`; getbook.ie (bought, waiting on the registrar) will also work once its
domain is connected, but until then use bookie.knowall.ai). A link only opens for someone whose
sign-in may see that organisation: the portal checks it again on every request, so a link is never a
way round the access rules. Still, only send links to people who may see that organisation.

## Organisation keys

Every page inside an organisation is `<base>/<orgKey>/<path>`. The org key is:

| Back end | Key |
|---|---|
| Business Central | `bc.<environment>.<companyId>` (environment e.g. `Production`, company id from BC `companies`) |
| Xero | `xero.<connectionId>.<xeroTenantId>` (connection id is the portal's own id for the Xero connection) |

Bookie reads the keys from `PORTAL_ORG_KEYS` in `~/.hermes/.env` (`<label>=<orgKey>;...`, set on the VM;
they are tenant ids, so never in the repo or in a public channel). When the key for an organisation is
unknown, link to `<base>` (the "My organisations" page) and say which organisation to pick.
Always URL-encode the key.

## Pages

| They want | Path (after `<base>/<orgKey>`) |
|---|---|
| Dashboard | (empty) |
| Sales overview / invoices / one invoice / new invoice | `/sales`, `/sales/invoices`, `/sales/invoices/<id>`, `/sales/invoices/new` |
| Quotes, credit notes, products | `/sales/quotes`, `/sales/credit-notes`, `/sales/products` |
| Purchases overview / bills / one bill / new bill | `/purchases`, `/purchases/bills`, `/purchases/bills/<id>`, `/purchases/bills/new` |
| Purchase orders, supplier credit notes | `/purchases/orders`, `/purchases/credit-notes` |
| Customers / suppliers / all contacts | `/contacts?role=customer`, `/contacts?role=supplier`, `/contacts` |
| Cash flow forecast | `/reporting/cash-flow-forecast` |
| Inbox (documents waiting to become bills) | `/purchases/inbox` |
| Search | `/search?q=<text>` |
| Organisation settings | `/settings` |
| Reports | `/reporting`, `/reporting/profit-and-loss`, `/reporting/balance-sheet`, `/reporting/aged-receivables`, `/reporting/aged-payables`, `/reporting/trial-balance`, `/reporting/bank-summary`, `/reporting/account-transactions`, `/reporting/journal-report` |
| A Bitcoin wallet (listed under Bank accounts) | `/accounting/bank/bitcoin/<walletId>` (Business Central: `bc~<bank account id>`) |
| Bank, chart of accounts, journals, payments, tax rates | `/accounting/bank`, `/accounting/bank/add` (add bank account), `/accounting/chart`, `/accounting/journals`, `/accounting/payments`, `/accounting/tax-rates` |

`<id>` is the back end's own id: Xero `InvoiceID`, BC `id` of the sales/purchase invoice. When a
section is missing for an organisation, its back end does not support it. Settings for connections
and for who can see what are at `<base>/settings` (not inside an organisation). For a tour of the
whole portal, see the guide skill.

## How to use it

- Offer the link after the answer, not instead of it: "Three bills are due this week (£4,120.00).
  They're here: <link>".
- For a change Bookie may not make (SOUL.md rule 2), link the screen where the person can make it, e.g.
  the bill's edit page, and say what to check.
- In Teams, use an HTML link with a short label (`<a href="...">Bill INV-0042</a>`); in voice, say
  "I've sent you the link in chat" and send it.
