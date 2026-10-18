namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// The Bitcoin wallet group on the Bank Account Card. Shown only to users with
/// BOOKIE BTC READ or EDIT, and editable only with BOOKIE BTC EDIT.
/// </summary>
pageextension 50250 "Bookie BTC Bank Account Card" extends "Bank Account Card"
{
    layout
    {
        addlast(Content)
        {
            group(BookieBitcoinWallet)
            {
                Caption = 'Bitcoin Wallet';
                Visible = BitcoinVisible;
                Editable = BitcoinEditable;

                field("Bitcoin Wallet Descriptor"; Rec."Bitcoin Wallet Descriptor")
                {
                    ApplicationArea = All;
                    MultiLine = true;
                }
                field("Bitcoin Script Type"; Rec."Bitcoin Script Type")
                {
                    ApplicationArea = All;
                }
            }
        }
    }

    trigger OnOpenPage()
    var
        BTCAccess: Record "Bookie BTC Access";
    begin
        BitcoinVisible := BTCAccess.ReadPermission();
        BitcoinEditable := BTCAccess.WritePermission();
    end;

    var
        BitcoinVisible: Boolean;
        BitcoinEditable: Boolean;
}
