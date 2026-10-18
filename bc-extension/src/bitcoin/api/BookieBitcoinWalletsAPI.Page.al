namespace KnowAll.Bookie.Bitcoin;

/// <summary>
/// Bank accounts that hold a Bitcoin wallet descriptor, for Bookie. Read-only.
///
/// Endpoint: /api/bookie/bitcoin/v1.0/companies({companyId})/bitcoinWallets
/// bankAccountId matches API v2.0 bankAccounts (the Bank Account SystemId). A 404 on
/// this route means the extension isn't installed; 403 means the caller lacks
/// BOOKIE BTC READ (the descriptor's table needs it).
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
    SourceTable = "Bookie BTC Wallet";
    SourceTableView = where("Wallet Descriptor" = filter(<> ''));
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
                field(bankAccountId; Rec."Bank Account Id")
                {
                    Caption = 'Bank Account Id';
                }
                field(number; Rec."Bank Account No.")
                {
                    Caption = 'No.';
                }
                field(displayName; Rec."Bank Account Name")
                {
                    Caption = 'Name';
                }
                // Blank = the company's local currency. Bookie reconciles BTC accounts only.
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                field(bitcoinWalletDescriptor; Rec."Wallet Descriptor")
                {
                    Caption = 'Bitcoin Wallet Descriptor';
                }
                field(bitcoinScriptType; Rec."Script Type")
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
