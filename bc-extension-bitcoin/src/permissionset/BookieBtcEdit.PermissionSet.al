namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// Everything in BOOKIE BTC READ, plus entering or changing a bank account's Bitcoin
/// wallet descriptor and script type on the Bank Account Card.
/// </summary>
permissionset 50251 "BOOKIE BTC EDIT"
{
    Assignable = true;
    Caption = 'Bookie Bitcoin Edit';
    IncludedPermissionSets = "BOOKIE BTC READ";

    Permissions =
        tabledata "Bank Account" = RM,
        tabledata "Bookie BTC Access" = RIMD;
}
