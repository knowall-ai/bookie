---
name: month-end-review
description: Month-end review of one organisation's books (or all of them) - overdue receivables, bills falling due, unreconciled bank lines, VAT deadlines, drafts left open and unusual profit-and-loss swings - delivered as a short report. Use when asked for a month-end check, a "how do the books look", or by the monthly cron job.
version: 0.1.0
metadata:
  hermes:
    tags: [bookkeeping, month-end, review, report]
    category: finance
    requires_toolsets: [terminal, mcp]
---

# Month-end review

Read-only. Uses the `books` skill for every query (organisation selection, endpoints, money format).
One report per organisation. Never send one organisation's report to someone who may not see it.

## Inputs

- **Period:** the calendar month just ended unless the person names another. State it at the top.
- **Organisation(s):** named by the person, or every organisation in `ORGANISATIONS` for the cron job.
- **Recipient:** the person asking, or `PRINCIPAL_UPN` for the cron job.

## Checklist (in this order)

1. **Overdue receivables.** Open sales invoices with due date before today. Total, count, and the five
   largest by amount outstanding with days overdue. Flag anything over 60 days.
2. **Bills falling due.** Open purchase invoices due in the next 14 days, and any already overdue.
   Total, count, the five largest, and the next payment run date if the organisation has one (Reverie
   preference).
3. **Unreconciled bank lines.** Xero: `BankTransactions?where=IsReconciled==false` for the period, per
   bank account: count, the oldest date, the net amount. BC: bank account ledger entries with
   `open eq true` if the environment exposes them; otherwise say this check is not available in BC.
4. **Drafts left open.** Draft or awaiting-approval invoices and bills older than 7 days, including
   bills `bill-capture` drafted and nobody has approved.
5. **VAT / sales tax.** From the organisation's settings: the tax basis and period, the current
   return's period end and the filing deadline. UK MTD VAT: due one month and seven days after the
   period end. Only state a deadline you can derive from the organisation's own settings; otherwise
   say the accountant should confirm it. Bookie never prepares or files a return.
6. **Unusual P&L swings.** Profit and loss for the period and the previous three months
   (`periods=3&timeframe=MONTH`). Flag any account line that moved more than 25 % **and** more than a
   materiality floor (default 5 % of the period's total income, or a preference stored in Reverie)
   against the average of the previous three. Give the movement, not a diagnosis: "Software costs up
   £2,140 (+61 %) against the three-month average." Possible reasons are questions, not conclusions.
7. **Anything odd.** Duplicate-looking bills (same supplier and amount within 30 days), payments to a
   supplier whose bank details changed this month, negative balances on asset accounts. These go to the
   accountant as "please look", never as an accusation.

## The report

Short: it should be read in under two minutes. Plain text or simple HTML for Teams:

```
Month-end review: <Organisation>, <Month YYYY> (as at <date time>)

Headline: <one sentence: the single thing that most needs attention>

1. Receivables: £X overdue across N invoices (M over 60 days). Largest: ...
2. Bills: £X due in the next 14 days (N bills); £Y already overdue.
3. Bank: N unreconciled lines in <account> (oldest <date>).
4. Drafts: N invoices / M bills waiting more than 7 days.
5. VAT: period ends <date>; return due <date>.  (or: "confirm with the accountant")
6. P&L: <up to three flagged movements>
7. Please look: <items, or "nothing unusual">

Figures read live from <Xero / Business Central> at <time>. Bookkeeping information, not tax advice.
Open in the portal: <PORTAL_BASE_URL>/...   (see the portal skill)
```

## Delivery

- Teams message to the recipient (Presence `teams` skill), or an email to an internal recipient
  (Presence `email` skill). Never to anyone outside the organisation.
- The report is sent and then forgotten: do not store it or its figures in Reverie. You may remember
  that the review ran and who received it.
- If a check failed (permission, timeout), the report says which and why. Never leave a section out silently.
