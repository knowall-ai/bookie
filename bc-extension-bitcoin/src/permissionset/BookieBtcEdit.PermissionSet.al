namespace KnowAll.Bookie.Bitcoin;

/// <summary>
/// Everything in BOOKIE BTC READ, plus entering, changing or clearing a bank account's
/// Bitcoin wallet descriptor and script type on the Bank Account Card. It grants no
/// rights on Bank Account itself: opening the card still needs the user's usual sets.
/// </summary>
permissionset 50251 "BOOKIE BTC EDIT"
{
    Assignable = true;
    Caption = 'Bookie Bitcoin Edit';
    IncludedPermissionSets = "BOOKIE BTC READ";

    Permissions =
        tabledata "Bookie BTC Wallet" = RIMD;
}
