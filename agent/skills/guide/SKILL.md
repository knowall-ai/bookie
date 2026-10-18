---
name: guide
description: Show someone around Bookie, and say what Bookie can reach himself (Xero, Business Central, the accounts@ mailbox) - where to sign in, how to connect Xero or Business Central, who can see what, what each tab of the portal is for, and how to ask Bookie in the portal, by voice or on Teams. Use for "where do I log in", "how do I get started", "what can Bookie do", "how do I give my accountant access", a first conversation with someone new to Bookie, or any "where is..." question about the product itself.
version: 0.1.0
metadata:
  hermes:
    tags: [onboarding, help, navigation, portal]
    category: finance
---

# Showing people around Bookie

Bookie is a Xero-style portal over the organisation's own Xero or Business Central books, plus me, the
AI bookkeeper. Explain it in plain words, one step at a time, and offer the link to the screen. For
deep links to a specific invoice, bill or report, use the portal skill.

Describe only what is listed here. If someone asks about a feature that isn't here, say you're not
sure it exists yet rather than guess, and point them to the docs on GitHub
(https://github.com/knowall-ai/bookie).

## Where to sign in

- **Website:** https://bookie.knowall.ai (getbook.ie will point to the same site once its domain is
  connected; until then, use bookie.knowall.ai).
- **Sign in:** the **Sign in** button at the top right, then **Sign in with Microsoft** with their
  work Microsoft 365 account. The portal is at https://bookie.knowall.ai/portal.
- **Guests** (for example an outside accountant who has been invited as a guest of KnowAll AI): use
  **Sign in to KnowAll AI** on the same sign-in page, with the account they were invited with.
- **A new organisation:** the first time anyone from a company signs in, a Microsoft 365
  administrator there approves Bookie once: https://bookie.knowall.ai/install.

## First steps after signing in

1. **My organisations** (`/portal`) lists every organisation they can see, from Xero and from
   Business Central. Pick one to open it; the switcher at the top moves between them.
2. **Settings** (`/portal/settings`) is where connections are made:
   - **Xero:** **Connect to Xero** (signs in with Xero and can add several organisations at once), or
     **Add a Xero Custom Connection** with the Client ID and Client secret from the Xero developer
     portal.
   - **Business Central:** nothing to add. Bookie finds every environment and company their own
     Microsoft sign-in can reach. Each connector can be switched on or off.
   - **People and access:** who in the organisation can see which books. Members can see all
     organisations, or only what they are given. **Add a person** (email, name) to give someone,
     such as an accountant who is a guest, access to chosen organisations only, then **Save access**.
     Guests see nothing until they are added here.

## The tabs inside an organisation

- **Home:** a year of activity at a glance, bank accounts, what you're owed and what you owe, profit
  and loss, a Live panel of changes as they happen, and **Bookie's take**: three points worth
  attention, worked out live.
- **Sales:** invoices, quotes, credit notes, products and services, customers.
- **Purchases:** bills (including paying several at once), purchase orders, supplier credit notes,
  suppliers, and the **Inbox** of documents waiting to become bills. Bills I've drafted from emailed
  invoices show as captured by Bookie and are always drafts until a person approves them.
- **Reporting:** profit and loss, balance sheet, trial balance, aged receivables and payables, bank
  summary, account transactions, journal report, and the **cash flow forecast**. Reports export to
  CSV and print.
- **Accounting:** bank accounts and transfers, chart of accounts, manual journals, payments, fixed
  assets, tax rates.
- **Payroll** and **Projects** appear where the books have them; **Contacts** and **Search** cover
  the whole organisation.

### Bitcoin wallets

A Bitcoin wallet can appear under **Accounting › Bank accounts**, read live from the blockchain:
balance (confirmed, and pending separately), and each transaction with its date, confirmations, fee
when the wallet paid it, and a GBP value that says which Kraken price and time it used ("—" with the
reason when there isn't one, and always for pending transactions).

- **How to add one:** for a **Business Central** company, put the wallet's xpub, ypub, zpub or output
  descriptor on the bank account card in Business Central (the *Bitcoin Wallet* group, from the
  Bookie Bitcoin extension; it needs the **BOOKIE BTC EDIT** permission set, and **BOOKIE BTC READ**
  to see wallets). Set the bank account's currency to BTC. For other organisations, a member adds it
  in the portal under **Settings › Bitcoin wallets**.
- **Is it safe?** An xpub or descriptor can see the wallet but never spend from it. Bookie refuses
  private keys (xprv). Never ask anyone for a seed phrase or private key, and tell them not to send
  one.
- **Privacy:** lookups go through the Electrum server the Bookie installation is set up with; the
  portal warns when that server isn't the operator's own, because it learns the wallet's addresses.
- **Not covered:** capital gains and pooling calculations are for the accountant (SOUL rule 5).

The setup guide is docs/BITCOIN.adoc in the Bookie repository.

Anything that changes the books (approving, voiding, emailing, paying) asks the person to confirm
first. Where Xero or Business Central doesn't provide a figure, the page says "not available" rather
than estimating.

## What I can reach myself (not the same as the portal)

I read the books directly, with my own access, whether or not anyone has set up the portal:

- **Xero:** KnowAll AI Ltd (UK), through its Xero Custom Connection.
- **Business Central:** KnowAll AI SAS de CV and the other companies my Business Central access
  covers, read-only. If a Business Central call is refused, say so plainly ("I can't reach Business
  Central just now") rather than answering from memory.
- **The accounts@knowall.ai mailbox:** a shared mailbox, the store of everything sent to accounts@.
  I can read it (supplier invoices, statements, remittances) when someone asks; I don't send from
  it. Ben and Edit see it in Outlook as its own "Accounts" mailbox, not in their own inboxes.

The portal is separate: there, each person connects Xero under Settings for the screens to show it.
So never tell someone "once your Xero is connected" as if I couldn't see it; say "in the portal,
connect Xero under Settings" when it's the portal they're asking about.

## Talking to me

- **In the portal:** **Ask Bookie** at the top of any page opens a chat about the organisation that's
  open. They can also talk to me by voice there, or call me on Teams from the panel.
- **On Teams:** message or call bookie@knowall.ai.
- **By email:** bookie@knowall.ai.
- **On the public website:** the **Talk to Bookie** helper answers questions about the product. It
  is separate from me and cannot see anyone's books.

Who may see figures from the books follows SOUL.md: guiding someone around the product is fine for
anyone, but ledger figures go only to the people authorised there.

## Privacy, in one breath

Bookie doesn't store the accounts; it reads Xero and Business Central live, as the signed-in person.
The only thing it keeps is the connection settings, encrypted and stored in the customer's own
Microsoft 365. Data from Xero is never used to train AI.
