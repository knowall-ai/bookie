namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// Bank accounts that hold a Bitcoin wallet descriptor, for Bookie. Read-only.
///
/// Endpoint: /api/bookie/bitcoin/v1.0/companies({companyId})/bitcoinWallets
/// Ids match API v2.0 bankAccounts (the Bank Account SystemId). A 404 on this route
/// means the extension isn't installed; 403 means the user lacks BOOKIE BTC READ.
/// </summary>
page 50250 "Bookie Bitcoin Wallets API"
{
    APIPublisher = 'bookie';
    APIGroup = 'bitcoin';
    APIVersion = 'v1.0';
    EntityName = 'bitcoinWallet';
    EntitySetName = 'bitcoinWallets';
    EntityCaption = 'Bitcoin Wallet';
    EntitySetCaption = 'Bitcoin Wallets';
    PageType = API;
    SourceTable = "Bank Account";
    SourceTableView = where("Bitcoin Wallet Descriptor" = filter(<> ''));
    ODataKeyFields = SystemId;
    DataAccessIntent = ReadOnly;
    Editable = false;
    InsertAllowed = false;
    ModifyAllowed = false;
    DeleteAllowed = false;
    Extensible = false;

    layout
    {
        area(Content)
        {
            repeater(Group)
            {
                field(id; Rec.SystemId)
                {
                    Caption = 'Id';
                }
                field(number; Rec."No.")
                {
                    Caption = 'No.';
                }
                field(displayName; Rec.Name)
                {
                    Caption = 'Name';
                }
                // Blank = the company's local currency. Bookie reconciles BTC accounts only.
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                field(bitcoinWalletDescriptor; Rec."Bitcoin Wallet Descriptor")
                {
                    Caption = 'Bitcoin Wallet Descriptor';
                }
                field(bitcoinScriptType; Rec."Bitcoin Script Type")
                {
                    Caption = 'Bitcoin Script Type';
                }
                field(lastModifiedDateTime; Rec.SystemModifiedAt)
                {
                    Caption = 'Last Modified DateTime';
                }
            }
        }
    }
}
