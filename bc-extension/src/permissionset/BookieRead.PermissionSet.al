namespace KnowAll.Bookie;

using Microsoft.Bank.BankAccount;
using Microsoft.Bank.Ledger;
using Microsoft.Bank.Reconciliation;
using Microsoft.Bank.Statement;
using Microsoft.Finance.FinancialReports;
using Microsoft.Finance.GeneralLedger.Account;
using Microsoft.Finance.GeneralLedger.Ledger;
using Microsoft.Finance.GeneralLedger.Setup;
using Microsoft.Foundation.Company;
using Microsoft.Foundation.Period;
using Microsoft.Purchases.History;
using Microsoft.Purchases.Payables;
using Microsoft.Purchases.Vendor;
using Microsoft.Sales.Customer;
using Microsoft.Sales.History;
using Microsoft.Sales.Receivables;

/// <summary>
/// For Bookie users: run Bookie's read-only API pages and read the tables they show.
/// It adds to the user's normal Business Central permissions (for example D365 BUS FULL
/// ACCESS or D365 READ), which Bookie needs anyway for the standard API v2.0.
/// </summary>
permissionset 50200 "BOOKIE READ"
{
    Assignable = true;
    Caption = 'Bookie Read';

    Permissions =
        page "Bookie Bank Acc. Balances API" = X,
        page "Bookie Bank Acc. Ledger API" = X,
        page "Bookie Cust. Ledger API" = X,
        page "Bookie Vendor Ledger API" = X,
        page "Bookie Posted Cust. Pmts API" = X,
        page "Bookie Posted Vendor Pmts API" = X,
        page "Bookie Financial Reports API" = X,
        page "Bookie Fin. Report Lines API" = X,
        page "Bookie Company Setup API" = X,
        tabledata "Bank Account" = R,
        tabledata "Bank Account Posting Group" = R,
        tabledata "Bank Account Ledger Entry" = R,
        tabledata "Bank Account Statement" = R,
        tabledata "Bank Acc. Reconciliation" = R,
        tabledata "G/L Account" = R,
        tabledata "G/L Entry" = R,
        tabledata "Cust. Ledger Entry" = R,
        tabledata "Detailed Cust. Ledg. Entry" = R,
        tabledata Customer = R,
        tabledata "Sales Invoice Header" = R,
        tabledata "Vendor Ledger Entry" = R,
        tabledata "Detailed Vendor Ledg. Entry" = R,
        tabledata Vendor = R,
        tabledata "Purch. Inv. Header" = R,
        tabledata "Financial Report" = R,
        tabledata "Acc. Schedule Name" = R,
        tabledata "Acc. Schedule Line" = R,
        tabledata "Column Layout" = R,
        tabledata "General Ledger Setup" = R,
        tabledata "Accounting Period" = R,
        tabledata "Company Information" = R;
}
