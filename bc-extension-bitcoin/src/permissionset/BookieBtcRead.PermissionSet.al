namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// See which bank accounts are Bitcoin wallets: the Bitcoin Wallet group on the Bank
/// Account Card (read-only) and the bitcoinWallets API Bookie reads. Give it to Bookie
/// users and to the Bookie agent's app user. A descriptor can't spend, but it reveals
/// every address and balance of the wallet.
/// </summary>
permissionset 50250 "BOOKIE BTC READ"
{
    Assignable = true;
    Caption = 'Bookie Bitcoin Read';

    Permissions =
        page "Bookie Bitcoin Wallets API" = X,
        tabledata "Bank Account" = R,
        tabledata "Bookie BTC Access" = R;
}
