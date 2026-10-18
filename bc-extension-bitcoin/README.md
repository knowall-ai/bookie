# Bookie Bitcoin (Business Central extension)

A small per-tenant extension that keeps a Bitcoin wallet's public descriptor (an xpub, ypub, zpub or output descriptor) for a Business Central **Bank Account**, so Bookie can show the wallet's transactions under Accounting › Bank accounts. It's watch-only: a descriptor can't spend, and the extension refuses private keys.

The descriptor is stored in its own table (`Bookie BTC Wallet`), not as a field on Bank Account. Only `BOOKIE BTC READ` and `BOOKIE BTC EDIT` can read it; ordinary Bank Account rights never reach it.

|                 |                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| App             | `Bookie Bitcoin` by `KnowAll`, id `b43701b1-70d6-43d4-9d83-3a9a6dc6a208`                               |
| Targets         | BC 27.0 or later, cloud                                                                                |
| Object ids      | 50250 to 50299 (Bookie BC API extension 50200 to 50249, Thyme 50100 to 50199)                          |
| API route       | `.../api/bookie/bitcoin/v1.0/companies({companyId})/bitcoinWallets` (read-only)                        |
| Permission sets | `BOOKIE BTC READ` (see wallets; also for the Bookie agent's app user), `BOOKIE BTC EDIT` (change them) |

To build it, run `bc-extension-bitcoin/build.sh`. Symbols come from Microsoft's public feed, or from your Sandbox with `SYMBOLS=sandbox`. Any alc works through `ALC_DLL`. [docs/BITCOIN.adoc](../docs/BITCOIN.adoc) covers publishing it, assigning the permission sets, and setting up the BTC currency and bank account.

| Path                                                    | What                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/table/BookieBTCWallet.Table.al`                    | The wallet per bank account: descriptor and script type (50250)      |
| `src/pageextension/BookieBTCBankAccountCard.PageExt.al` | The Bitcoin Wallet group on the Bank Account Card (50250)            |
| `src/api/BookieBitcoinWalletsAPI.Page.al`               | The `bitcoinWallets` API page (50250)                                |
| `src/codeunit/BookieBTCWalletEvents.Codeunit.al`        | Deletes a wallet with its bank account (50250)                       |
| `src/enum/BookieBTCScriptType.Enum.al`                  | Script type (50250)                                                  |
| `src/permissionset/`                                    | `BOOKIE BTC READ` (50250), `BOOKIE BTC EDIT` (50251)                 |
| `build.sh`                                              | Compile on Linux or macOS                                            |
