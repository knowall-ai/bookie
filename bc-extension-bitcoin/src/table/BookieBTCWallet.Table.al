namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// A Bitcoin wallet's public descriptor for one bank account. It lives in its own table,
/// not on Bank Account, so reading it takes BOOKIE BTC READ (or EDIT): Bank Account
/// read rights alone (personalisation, Edit in Excel, OData, reports) never reach it.
/// Watch-only: an xpub or descriptor can see a wallet but never spend from it, but it
/// does reveal every address and balance.
/// </summary>
table 50250 "Bookie BTC Wallet"
{
    Caption = 'Bookie Bitcoin Wallet';
    DataClassification = CustomerContent;

    fields
    {
        field(1; "Bank Account No."; Code[20])
        {
            Caption = 'Bank Account No.';
            TableRelation = "Bank Account";
            NotBlank = true;
        }
        field(2; "Bank Account Id"; Guid)
        {
            Caption = 'Bank Account Id';
            Editable = false;
        }
        field(10; "Wallet Descriptor"; Text[1024])
        {
            Caption = 'Bitcoin Wallet Descriptor';
            ToolTip = 'Specifies the wallet''s extended public key (xpub, ypub or zpub) or output descriptor, such as wpkh([fingerprint/84h/0h/0h]xpub.../<0;1>/*). Bookie reads the wallet''s transactions with it. Never enter a private key (xprv).';

            trigger OnValidate()
            begin
                Rec."Wallet Descriptor" := CopyStr(DelChr(Rec."Wallet Descriptor", '<>', ' '), 1, MaxStrLen(Rec."Wallet Descriptor"));
                if IsPrivateKey(Rec."Wallet Descriptor") then
                    Error(PrivateKeyErr);
            end;
        }
        field(11; "Script Type"; Enum "Bookie BTC Script Type")
        {
            Caption = 'Bitcoin Script Type';
            ToolTip = 'Specifies which addresses a bare xpub makes. Leave it on Automatic for ypub, zpub and output descriptors, which already say so.';
        }
        field(20; "Bank Account Name"; Text[100])
        {
            Caption = 'Bank Account Name';
            FieldClass = FlowField;
            CalcFormula = lookup("Bank Account".Name where("No." = field("Bank Account No.")));
            Editable = false;
        }
        field(21; "Currency Code"; Code[10])
        {
            Caption = 'Currency Code';
            FieldClass = FlowField;
            CalcFormula = lookup("Bank Account"."Currency Code" where("No." = field("Bank Account No.")));
            Editable = false;
        }
    }

    keys
    {
        key(PK; "Bank Account No.")
        {
            Clustered = true;
        }
    }

    trigger OnInsert()
    begin
        SetBankAccountId();
    end;

    trigger OnModify()
    begin
        SetBankAccountId();
    end;

    trigger OnRename()
    begin
        SetBankAccountId();
    end;

    var
        PrivateKeyErr: Label 'That is a private key. Bookie only needs the public key (xpub, ypub or zpub) or an output descriptor. Never enter a private key here.';

    local procedure SetBankAccountId()
    var
        BankAccount: Record "Bank Account";
    begin
        if BankAccount.Get(Rec."Bank Account No.") then
            Rec."Bank Account Id" := BankAccount.SystemId;
    end;

    /// <summary>True when any key in the text starts with a private-key prefix (at the start or after "(", "," or "]").</summary>
    local procedure IsPrivateKey(Value: Text): Boolean
    var
        Prefixes: List of [Text];
        Prefix: Text;
        Separators: Text;
        Rest: Text;
        Position: Integer;
        Offset: Integer;
    begin
        Prefixes.AddRange('xprv', 'yprv', 'zprv', 'tprv', 'uprv', 'vprv');
        Separators := '(,]';
        foreach Prefix in Prefixes do begin
            if Value.StartsWith(Prefix) then
                exit(true);
            // Every occurrence, not just the first.
            Rest := Value;
            Offset := 0;
            Position := StrPos(Rest, Prefix);
            while Position > 0 do begin
                if Offset + Position > 1 then
                    if StrPos(Separators, CopyStr(Value, Offset + Position - 1, 1)) > 0 then
                        exit(true);
                Offset += Position;
                Rest := CopyStr(Value, Offset + 1);
                Position := StrPos(Rest, Prefix);
            end;
        end;
        exit(false);
    end;
}
