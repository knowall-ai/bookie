# Bookie BC extension

An optional Microsoft Dynamics 365 Business Central extension that adds the custom API `api/knowallBookie/bookie/v1.0`. It fills the gaps in BC's standard API v2.0 that Bookie runs into, so Bookie can show exact figures instead of "not available from Business Central".

Bookie works without it. When it is installed, Bookie detects it (one `companySetup` call per tenant, environment and company, cached for 10 minutes) and uses it. If it is uninstalled, Bookie falls back to API v2.0 within 10 minutes.

|                 |                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| App             | `Bookie BC API Extension` by `KnowAll`, id `76f5224b-85e0-4956-af6b-07f140665e4f`                                               |
| Targets         | BC 27.0 or later (platform and application 27.0, runtime 16.0), cloud                                                           |
| Object ids      | 50200 to 50249 (Thyme uses 50100 to 50199 and Bookie Bitcoin 50250 to 50299, so all can be installed)                            |
| API route       | `https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/knowallBookie/bookie/v1.0/companies({companyId})/...` |
| Permission sets | `BOOKIE READ`, `BOOKIE WRITE`                                                                                                   |
| Stores data?    | No. The only table is temporary; every page reads BC's own tables.                                                              |

## What Bookie gets from it

| Endpoint                      | What it returns                                                                                                                                                                                                                                                    | Bookie screens that improve                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companySetup`                | LCY code (General Ledger Setup), fiscal year start and end (Accounting Periods), country, VAT and registration numbers, the financial reports G/L Setup uses, the extension version. One row. Also the install check: a 404 means not installed.                   | Currency everywhere (no more guessing it from the country); Home P&L year to date when API v2.0 has no fiscal year                                                     |
| `bankAccountBalances`         | Each bank account with its bank ledger balance (account currency and LCY), the G/L account behind its posting group and that account's balance, the last posted statement (number, balance, date), the open reconciliation, and the number of unreconciled entries | Accounting > Bank accounts (balance, statement balance and date, items to reconcile), Home bank cards                                                                  |
| `bankAccountLedgerEntries`    | Posted bank account ledger entries: posting date, document no., external document no., description, amount, open/closed, statement status and no., balancing account, reversed                                                                                     | Bank account transactions list (previously "not available")                                                                                                            |
| `customerLedgerEntries`       | Customer ledger entries with amount, original and remaining amounts (and in LCY), due date, open, customer id. Add `dateFilter le {date}` for amounts remaining as at a date.                                                                                      | Available for exact aged receivables (not yet used by the reports module)                                                                                              |
| `vendorLedgerEntries`         | The same for vendors                                                                                                                                                                                                                                               | Purchases > Bills: true amount due and amount paid on posted bills; Home "bills to pay" totals                                                                         |
| `postedCustomerPayments`      | Posted payments applied to invoices: date, payment no., amount applied, invoice no. and id, customer, bank account                                                                                                                                                 | Accounting > Payments (posted payments rather than unposted journal lines)                                                                                             |
| `postedVendorPayments`        | The same for bills                                                                                                                                                                                                                                                 | Accounting > Payments                                                                                                                                                  |
| `financialReports`            | The company's financial report definitions and their row definitions                                                                                                                                                                                               | Available to the reports module                                                                                                                                        |
| `financialReportLines`        | Rows of a row definition with net change and balance at date for `dateFilter`, calculated by BC's own engine (`AccSchedManagement.CalcCell`)                                                                                                                       | Available so the P&L can follow each company's own report setup (`extensionFinancialReport` in `web/src/lib/connectors/bc/extension.ts`; not yet wired into Reporting) |
| `paymentRegistrations` (POST) | Registers one customer payment against one open posted sales invoice                                                                                                                                                                                               | Sales invoice > Record a payment (appears for BC once installed and the user has `BOOKIE WRITE`)                                                                       |

Every read page is `DataAccessIntent = ReadOnly` (served from a read replica where BC has one), not editable, and has `ODataKeyFields = SystemId`, so ids match API v2.0 (bank account, customer, vendor and invoice ids are the same GUIDs).

Filtering works on table fields (for example `bankAccountNumber`, `documentNumber`, `postingDate`, `open`); computed fields such as `customerId`, `glBalance` or `netChange` can be selected but not filtered on.

### Payment registration: how it stays safe

`POST .../paymentRegistrations` with `{ "invoiceId", "bankAccountId", "paymentDate", "amount", "externalDocumentNumber"? }` (or `invoiceNumber` / `bankAccountNumber` instead of the ids).

We did **not** call codeunit `Payment Registration Mgt.` directly, because it can't be done safely from a cloud extension:

- its `Post` procedure is `Scope('OnPrem')`, so a SaaS extension can't call it (the compiler refuses: AL0296);
- `ConfirmPost` asks the user to confirm, which fails in an API session;
- `Post` posts the whole journal batch in the user's Payment Registration Setup, so it could post other people's unposted lines.

Instead the extension builds the same payment line Payment Registration would and posts **that single line** with `Gen. Jnl.-Post Line`.`RunWithCheck`:

- the user's **Payment Registration Setup** supplies the journal template, batch and number series (a user without one gets a copy of the company default, as the Payment Registration page does);
- the line is a customer payment, applied to the invoice (`Applies-to Doc. No.`) and balanced against the chosen bank account; it is never inserted into the batch, so nothing else is posted;
- one invoice per call, and one API call is one BC transaction: if any check or the posting fails, nothing is posted and the number series doesn't move;
- refused: amounts above the invoice's remaining amount, invoices already paid, foreign-currency invoices, blocked or foreign-currency bank accounts. Bills are refused too (Payment Registration is for customers); Bookie hides "Record a payment" on BC bills.

Bookie still asks the user to confirm before it calls this, like every write that posts to the books.

## Build

CI: [`.github/workflows/bc-extension.yml`](../.github/workflows/bc-extension.yml) compiles it on every PR that touches `bc-extension/` (Linux, AL compiler dotnet tool, CodeCop + PerTenantExtensionCop + UICop, warnings as errors) and uploads the `.app` as the `bookie-bc-extension` artifact. It never publishes anywhere.

Locally (Linux or macOS, no Docker):

```bash
dotnet tool install --global Microsoft.Dynamics.BusinessCentral.Development.Tools --version 18.1.43.24897
bc-extension/scripts/build.sh
# -> bc-extension/output/KnowAll_Bookie BC API Extension_1.0.0.0.app
```

The script downloads BC 27 symbols from Microsoft's public MSSymbols NuGet feed into `bc-extension/.alpackages`. It can also use the AL Language VS Code extension's compiler (`AL_COMPILER=vscode`, needs the .NET 10 runtime). In VS Code, open `bc-extension/`, run "AL: Download Symbols" against the Sandbox, and build with Ctrl+Shift+B.

## Install

You need a BC user with the `EXTEN. MGT. - ADMIN` permission set (or `SUPER`) in the environment. Publish to the **Sandbox first**, check it, then Production.

### 1. Sandbox

1. Get the `.app`: open the latest green **BC extension** workflow run on GitHub, download the `bookie-bc-extension` artifact and unzip it (or build it locally as above).
2. Open the Sandbox environment in Business Central, search for **Extension Management**, choose **Manage > Upload Extension**.
3. Choose the `.app` file, set **Deploy to** to **Current version**, accept the terms, choose **Deploy**.
4. Choose **Manage > Deployment Status** and wait for the upload to show **Completed**. **Bookie BC API Extension** by KnowAll now appears in Installed Extensions.
5. Assign permissions (see [Permissions](#permissions)) to yourself in CRONUS.
6. For "Record a payment": search for **Payment Registration Setup** and set a journal template and batch (for example `CASHRCPT` / a batch with a number series) and the balancing bank account. Do this once with the user field blank for a company default, or per user.
7. Check the API answers (the response is your company setup, not 404):
   ```bash
   TOKEN=$(az account get-access-token --resource https://api.businesscentral.dynamics.com --query accessToken -o tsv)
   curl -s -H "Authorization: Bearer $TOKEN" \
     "https://api.businesscentral.dynamics.com/v2.0/<tenant>/Sandbox/api/knowallBookie/bookie/v1.0/companies(<companyId>)/companySetup"
   ```
8. In Bookie, open the CRONUS (Sandbox) organisation. Within 10 minutes (or after restarting a dev server) bank balances and transactions appear, bills show amounts due, and an open sales invoice offers **Record a payment**. Record one, then check it in BC under the customer's **Ledger Entries** (a Payment applied to the invoice) and on the bank account's ledger entries.

### 2. Production

Only after the same version has been checked in the Sandbox.

1. Open the Production environment in Business Central, **Extension Management > Manage > Upload Extension**.
2. Choose the same `.app`, **Deploy to: Current version** (or **Next minor version** to install with the next BC update), accept, **Deploy**, and wait for **Completed** under **Deployment Status**.
3. Assign the permission sets in each Production company Bookie should use.
4. If people will record payments from Bookie, set up **Payment Registration Setup** in each company.

**Updates:** raise `version` in `app.json` (BC refuses an upload with the same or a lower version), build, then repeat the Sandbox and Production steps. The extension has no stored tables, so upgrades need no data migration.

**Removing it:** Extension Management > select **Bookie BC API Extension** > **Uninstall** (and **Unpublish** to remove it fully). Bookie goes back to API v2.0 behaviour within 10 minutes.

**Automating it later:** Thyme publishes its extension from GitHub Actions with BcContainerHelper's `Publish-PerTenantExtensionApps` and an Entra app registered in the BC admin center (`thyme-bc-extension/.github/workflows/deploy-sandbox.yml`). The same approach works here once an Entra app with `API.ReadWrite.All` and the `EXTEN. MGT. - ADMIN` permission set exists; it is deliberately not set up.

## Permissions

| Permission set | Give it to                                      | What it grants                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BOOKIE READ`  | Everyone who uses Bookie with this company      | Run the read-only Bookie API pages and read the tables they show (bank accounts and ledgers, customer and vendor ledgers and detailed entries, posted invoice headers, financial reports, G/L setup, accounting periods, company information) |
| `BOOKIE WRITE` | People who record customer payments from Bookie | Everything in `BOOKIE READ`, the payment registration page, reading Payment Registration Setup (and creating the user's copy of the default), and `D365 JOURNALS, POST` to post the payment                                                   |

These add to the user's normal BC permissions (for example `D365 BUS FULL ACCESS`), which Bookie needs anyway for API v2.0. Without `BOOKIE READ`, BC answers 403 and Bookie behaves as if the extension weren't installed.

To assign them:

- **One user:** search **Users**, open the user, and in **User Permission Sets** add `BOOKIE READ` (and `BOOKIE WRITE`). Leave **Company** blank for all companies, or pick one.
- **A group (recommended):** search **Security Groups**, create one linked to an Entra group (for example "Bookie users"), and add the permission sets under **Permissions**. Everyone in the Entra group gets them.

## Layout

| Path                                                 | What                                          |
| ---------------------------------------------------- | --------------------------------------------- |
| `app.json`                                           | Manifest                                      |
| `src/api/`                                           | API pages 50200 to 50209                      |
| `src/codeunit/BookiePaymentRegistration.Codeunit.al` | Payment registration logic (codeunit 50200)   |
| `src/table/BookiePaymentRegistration.Table.al`       | Temporary request/result table (50200)        |
| `src/permissionset/`                                 | `BOOKIE READ` (50200), `BOOKIE WRITE` (50201) |
| `scripts/build.sh`                                   | Compile on Linux or macOS                     |
