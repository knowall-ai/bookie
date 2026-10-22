namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// The Bitcoin Wallet group on the Bank Account Card. It reads and writes the
/// "Bookie BTC Wallet" table, so it shows only for users who can read that table
/// (BOOKIE BTC READ or EDIT) and is editable only for those who can write it (EDIT).
/// Clearing the descriptor removes the wallet.
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
                Visible = CanReadWallet;
                Editable = CanEditWallet;

                field(BookieWalletDescriptor; WalletDescriptor)
                {
                    ApplicationArea = All;
                    Caption = 'Bitcoin Wallet Descriptor';
                    ToolTip = 'Specifies the wallet''s extended public key (xpub, ypub or zpub) or output descriptor, such as wpkh([fingerprint/84h/0h/0h]xpub.../<0;1>/*). Bookie reads the wallet''s transactions with it. Never enter a private key (xprv).';
                    MultiLine = true;

                    trigger OnValidate()
                    begin
                        SaveWallet();
                    end;
                }
                field(BookieWalletScriptType; WalletScriptType)
                {
                    ApplicationArea = All;
                    Caption = 'Bitcoin Script Type';
                    ToolTip = 'Specifies which addresses a bare xpub makes. Leave it on Automatic for ypub, zpub and output descriptors, which already say so.';

                    trigger OnValidate()
                    begin
                        SaveWallet();
                    end;
                }
            }
        }
    }

    trigger OnOpenPage()
    var
        Wallet: Record "Bookie BTC Wallet";
    begin
        CanReadWallet := Wallet.ReadPermission();
        CanEditWallet := Wallet.WritePermission();
    end;

    trigger OnAfterGetCurrRecord()
    var
        Wallet: Record "Bookie BTC Wallet";
    begin
        Clear(WalletDescriptor);
        Clear(WalletScriptType);
        if not CanReadWallet then
            exit;
        if Wallet.Get(Rec."No.") then begin
            WalletDescriptor := Wallet."Wallet Descriptor";
            WalletScriptType := Wallet."Script Type";
        end;
    end;

    local procedure SaveWallet()
    var
        Wallet: Record "Bookie BTC Wallet";
    begin
        Rec.TestField("No.");
        if not Wallet.Get(Rec."No.") then begin
            if WalletDescriptor = '' then
                exit;
            Wallet.Init();
            Wallet."Bank Account No." := Rec."No.";
            Wallet.Validate("Wallet Descriptor", WalletDescriptor);
            Wallet."Script Type" := WalletScriptType;
            Wallet.Insert(true);
        end else
            if WalletDescriptor = '' then
                Wallet.Delete(true)
            else begin
                Wallet.Validate("Wallet Descriptor", WalletDescriptor);
                Wallet."Script Type" := WalletScriptType;
                Wallet.Modify(true);
            end;
        WalletDescriptor := Wallet."Wallet Descriptor";
    end;

    var
        WalletDescriptor: Text[1024];
        WalletScriptType: Enum "Bookie BTC Script Type";
        CanReadWallet: Boolean;
        CanEditWallet: Boolean;
}
