namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// Removes a bank account's Bitcoin wallet when the bank account is deleted, so no
/// descriptor is left behind for an account that no longer exists. Renames follow the
/// table relation on "Bank Account No.".
/// </summary>
codeunit 50250 "Bookie BTC Wallet Events"
{
    Access = Internal;
    Permissions = tabledata "Bookie BTC Wallet" = rd;

    [EventSubscriber(ObjectType::Table, Database::"Bank Account", 'OnAfterDeleteEvent', '', false, false)]
    local procedure DeleteWalletWithBankAccount(var Rec: Record "Bank Account"; RunTrigger: Boolean)
    var
        Wallet: Record "Bookie BTC Wallet";
    begin
        if Rec.IsTemporary() then
            exit;
        if Wallet.Get(Rec."No.") then
            Wallet.Delete();
    end;
}
