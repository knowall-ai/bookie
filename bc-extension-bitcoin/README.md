# Bookie Bitcoin (Business Central extension)

A small per-tenant extension that keeps a Bitcoin wallet's public descriptor (xpub, ypub, zpub or output descriptor) on a Business Central **Bank Account**, so Bookie can show the wallet's transactions under Accounting › Bank accounts. Watch-only: a descriptor can't spend, and the extension refuses private keys.

|                 |                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| App             | `Bookie Bitcoin` by `KnowAll`, id `b43701b1-70d6-43d4-9d83-3a9a6dc6a208`                           |
| Targets         | BC 27.0 or later, cloud                                                                            |
| Object ids      | 50250 to 50299 (Bookie BC API extension 50200 to 50249, Thyme 50100 to 50199)                      |
| API route       | `.../api/bookie/bitcoin/v1.0/companies({companyId})/bitcoinWallets` (read-only)                    |
| Permission sets | `BOOKIE BTC READ` (see wallets; also for the Bookie agent's app user), `BOOKIE BTC EDIT` (change them) |

Build with `APP=bitcoin bc-extension/scripts/build.sh` (it shares the other extension's symbol cache). How to publish it, assign the permission sets and set up the BTC currency and bank account: [docs/BITCOIN.adoc](../docs/BITCOIN.adoc).

| Path                                                   | What                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `src/tableextension/BookieBTCBankAccount.TableExt.al`  | Descriptor and script type on Bank Account (50250)              |
| `src/pageextension/BookieBTCBankAccountCard.PageExt.al` | The Bitcoin Wallet group on the Bank Account Card (50250)       |
| `src/api/BookieBitcoinWalletsAPI.Page.al`              | The `bitcoinWallets` API page (50250)                           |
| `src/enum/BookieBTCScriptType.Enum.al`                 | Script type (50250)                                             |
| `src/table/BookieBTCAccess.Table.al`                   | Empty table used only for the permission check (50250)          |
| `src/permissionset/`                                   | `BOOKIE BTC READ` (50250), `BOOKIE BTC EDIT` (50251)            |
