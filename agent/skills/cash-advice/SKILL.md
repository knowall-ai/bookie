---
name: cash-advice
description: Practical cash advice from the live books - cash position and runway, what is coming in and going out over the next weeks, which customers to chase and in what order, with payment-chasing emails written as drafts for a person to send. Use for "how long will our cash last", "who should we chase", "can we afford X this month", or a request to draft a chaser.
version: 0.1.0
metadata:
  hermes:
    tags: [cash, runway, credit-control, receivables]
    category: finance
    requires_toolsets: [terminal, mcp]
---

# Cash advice

Read-only, using the `books` skill for every figure. This is bookkeeping information and practical
suggestions, not financial or investment advice (SOUL.md rule 5). Say so once, briefly, when the
question is about a decision ("can we afford to hire?").

## 1. Cash position and runway

1. **Cash now:** bank balances (Xero `Reports/BankSummary`; BC bank accounts) per account and in total,
   in the organisation's base currency. Name accounts excluded (savings, VAT reserve) if the
   organisation keeps a preference for that in Reverie.
2. **Average monthly burn:** from the last three full months of profit and loss, cash-relevant lines
   only (exclude depreciation and other non-cash items you can identify by account type). Or, better
   when available, actual bank outflows less inflows per month for the same three months. Say which
   method you used.
3. **Runway** = cash now / net monthly burn. Only when burn is positive; otherwise say the
   organisation is cash-generative over that period. Give it in months to one decimal, with the
   assumption stated: "about 7.5 months at the last three months' average net outflow of £18,400".
4. **Next 30/60/90 days:** expected in = open sales invoices by due date (adjust for each customer's
   usual lateness if you can measure it from paid invoices: average days paid after due); expected out
   = open bills by due date plus known regular outgoings (payroll, rent) only if the books show them as
   repeating. Show it as three lines, not a model.
5. Flag: a week where expected cash goes below zero; VAT or tax payments due in the window (from the
   organisation's settings, see month-end-review step 5); concentration (one customer > 30 % of
   receivables).

Never extrapolate beyond what the books show. No invented growth, no assumed new sales.

## 2. Who to chase, in what order

Rank open, overdue sales invoices by: amount outstanding x days overdue, then customer history (late
payers first only when the history is in the books). For each: customer, invoice number, amount, days
overdue, last chased (from Reverie: "chased by email on <date>", not the invoice details) and the
suggested next step:

| Days overdue | Suggested step |
|---|---|
| 1-7 | Friendly reminder |
| 8-30 | Firm reminder with the invoice attached |
| 31-60 | Phone call from the account owner; reminder copied to their finance contact |
| 60+ | Accountant decides: statement, stop work, late payment interest (UK: the Late Payment of Commercial Debts Act applies to B2B debts) or a collections route |

Disputed invoices (a note on the invoice or in Reverie) are never chased automatically: list them
separately for a human.

## 3. Drafting payment-chasing emails (drafts only)

Bookie **never sends** a chaser. Every chaser is a draft, reviewed and sent by a person from their own
mailbox (SOUL.md rule 7; the AI Agents transport rule also blocks Bookie from external mail).

1. Write the email: British, polite, short. Subject `Invoice <number>: payment overdue` (or
   `reminder` for 1-7 days). Body: invoice number, date, amount and currency, due date, days overdue,
   how to pay (the payment details printed on the invoice, never a new bank account), and a line
   asking them to reply if there is a problem. Sign off as the person who will send it, not as Bookie.
2. Where it goes, in this order:
   - **A draft in the sender's own mailbox** when they have shared their mailbox with Bookie or made
     him a delegate: `MS365_USER_ID=<their upn> node ~/presence/scripts/graph.mjs create-draft --json <file>`
     (message object: `subject`, `body` HTML, `toRecipients`). A `no delegated access` error means no
     rights: fall back, do not retry.
   - Otherwise **send the draft text to the requester** in Teams (or email to their internal address),
     clearly marked `DRAFT - please review and send from your own mailbox`.
3. Tell the requester where the draft is, and list what they should check (recipient, amount, any
   dispute). Remember in Reverie only that a chaser was drafted for that customer and when.
4. Never put more than one customer's invoices in one draft. Never copy another customer.

## 4. Answer shape

Lead with the one-line answer, then up to five bullets, then the offer:

> Cash covers about 7.5 months at the current burn. Bank: £138,200 across 2 accounts. Due in over 30 days:
> £41,900 from 9 invoices; out: £22,300 from 14 bills. Three customers are more than 30 days late
> (£12,480). Shall I draft chasers for those three?
