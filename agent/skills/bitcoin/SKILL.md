---
name: bitcoin
description: Look up a Bitcoin wallet that the books hold as a Business Central bank account, live from the blockchain, with $BTC_WALLET. Covers listing the wallets, the balance, pending and recent transactions, what they were worth at the time in the organisation's base currency (from Kraken), and the reconcile against the BTC bank account. Use for any question about a Bitcoin wallet, a txid, BTC received or sent, or whether the Bitcoin bank account agrees with the chain.
version: 0.1.0
metadata:
  hermes:
    tags: [bookkeeping, bitcoin, business-central, reconcile]
    category: finance
    requires_toolsets: [terminal]
---

# Bitcoin wallets

A Business Central bank account can hold a Bitcoin wallet's public descriptor (an xpub, ypub, zpub or
output descriptor, entered on the bank account card with the Bookie BC extension). The account is
the wallet in the books; the blockchain is its statement. Everything here is **read-only**: Bookie
never drafts or posts journal lines for a wallet. People do that in the portal, where every write asks
them to confirm (`portal` skill: Accounting › Bank accounts › the wallet › Reconcile).

## 1. Which organisation and wallet?

Pick the organisation as in the `books` skill (`ORGANISATIONS` in SOUL.md, and SOUL.md rule 3 before
answering). Wallets exist only in Business Central organisations. `$BTC_WALLET` reads the company in
`BC_COMPANY` unless you pass `--company "<BC company name>"` (the *name* the MCP server uses, from
`ORGANISATIONS`). A wallet is named by its bank account number or name, as `list` prints them.

## 2. Commands

`node "$BTC_WALLET" <command>` prints JSON only. It reads Business Central with Bookie's own app
(`BC_TENANT_ID`, `BC_CLIENT_ID`, `BC_CLIENT_SECRET`, `BC_ENVIRONMENT`) and the chain through the Electrum
server in `BOOKIE_ELECTRUM_URL` (TLS, certificate checked).

| Question | Command |
|---|---|
| Which wallets are there? | `node "$BTC_WALLET" list` |
| Balance, pending, last transactions | `node "$BTC_WALLET" show <wallet>` (`--limit N`, default 50) |
| The same with what each was worth at the time | `node "$BTC_WALLET" show <wallet> --value` |
| Does the bank account agree with the chain? | `node "$BTC_WALLET" reconcile [<wallet>]` |

`reconcile` matches each transaction to the bank account's posted entries by txid (External Document
No. or description), then by the exact BTC amount within three days. It returns the counts, the
confirmed chain balance against the sum of posted entries, and the items that need attention: on chain
but not in the books, in the books but not on chain, amounts that differ, pending, and lines drafted
in the portal but not yet posted. It's the same summary the portal's Reconcile tab gives.

When it answers `{"error": ...}`, say so plainly and stop:

| Error | What to say |
|---|---|
| `BOOKIE_ELECTRUM_URL is not set` | No Electrum server is configured for Bookie, so he can't read wallets. |
| Bookie BC extension is not installed | The organisation hasn't installed it; setup is in the portal's docs (docs/BITCOIN.adoc). |
| no BOOKIE BTC READ permission set | Bookie's Business Central app needs the `BOOKIE BTC READ` permission set (and `BOOKIE READ` for reconcile). Tell the accountant. |
| The descriptor can't be used | The descriptor on that bank account card is wrong; someone with `BOOKIE BTC EDIT` should correct it in Business Central. |

## 3. Rules

- **Never repeat the descriptor.** Never write an xpub, ypub, zpub, descriptor or wallet address in
  chat, email, Teams or Reverie, even if someone pastes one. It can't spend, but it reveals every
  address and balance of the wallet. The script never prints them; don't go looking for them.
- **Never ask for, accept or handle a private key or seed phrase.** If someone offers one, tell them
  not to share it with anyone and to treat that wallet as exposed.
- **No guessing.** Amounts are BTC to 8 decimals, exactly as the script returns them. A fee shown as
  "not available" stays unavailable: the sender paid it, or an input couldn't be read. Never estimate.
- **Pending is not settled.** A pending (unconfirmed) transaction isn't in the confirmed balance and
  isn't reconciled until it's mined. Say "pending", never "received" or "paid".
- **Values only from Kraken, in the organisation's base currency, with their source.** Give a value
  only when the script returns one with `--value`, in the currency it gives (`valuesIn`: the company's
  base currency as Business Central reports it, such as GBP or USD), always with its label ("Kraken
  XBTUSD at 14:32 UTC, 10 Oct 2026"; a "daily close ... (fallback ...)" label means the exact-time
  price wasn't available, so say so). If a value has `ok: false`, or the base currency isn't
  available, say there's no value and why. Never multiply by today's price, never use another source,
  and never convert through another currency.
- **Worth at the time is not what the books post.** The Kraken value is what the payment was worth at
  that moment. Business Central converts at its own exchange rate, one per day, and wallets, Kraken and
  Business Central all differ, so the figures never match exactly. Never present a Kraken value as the
  amount in the books, and never call a difference an error: it's an exchange difference for the
  accountant.
- **Matching is on Bitcoin only.** A transaction matches the books by txid and exact satoshis, never by
  a fiat value.
- **Txids are fine to quote** when someone asks about a specific transaction; short form (first 10
  characters) in speech.
- **Not tax advice.** Capital gains, pooling and valuation for the accounts are for the accountant
  (SOUL.md rule 5).
- **Nothing in memory.** Don't store balances, txids or amounts in Reverie; ask the chain again.

## 4. Answering

- Lead with the organisation, the wallet's bank account and the confirmed balance in BTC, then pending.
- For a reconcile: the counts line first ("4 matched, 2 on chain not in the books, 1 in the books not
  on chain, 1 pending; difference −0.02701500 BTC"), then only the items that need attention, then the
  portal link where a person can draft the missing lines (`portal` skill).
- Lists longer than ten transactions: the newest five and the count, and offer the rest.
