namespace KnowAll.Bookie;

using Microsoft.Bank.Payment;
using System.Security.AccessControl;

/// <summary>
/// For Bookie users who record payments: everything in BOOKIE READ, plus registering a
/// customer payment against an invoice (paymentRegistrations). Posting the payment also
/// needs BC's journal posting permissions, included here as D365 JOURNALS, POST, and
/// reads the user's Payment Registration Setup (copying the company default the first
/// time, as the Payment Registration page does).
/// </summary>
permissionset 50201 "BOOKIE WRITE"
{
    Assignable = true;
    Caption = 'Bookie Write';
    IncludedPermissionSets = "BOOKIE READ", "D365 JOURNALS, POST";

    Permissions =
        page "Bookie Payment Registr. API" = X,
        codeunit "Bookie Payment Registration" = X,
        table "Bookie Payment Registration" = X,
        tabledata "Payment Registration Setup" = RI;
}
