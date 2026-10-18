namespace KnowAll.Bookie.Bitcoin;

using Microsoft.Bank.BankAccount;

/// <summary>
/// A Bitcoin wallet's public descriptor on the bank account that holds it in the books.
/// Watch-only: an xpub or descriptor can see a wallet but never spend from it. It does
/// reveal every address and balance, so only BOOKIE BTC READ/EDIT users see it.
/// </summary>
tableextension 50250 "Bookie BTC Bank Account" extends "Bank Account"
{
    fields
    {
        field(50250; "Bitcoin Wallet Descriptor"; Text[1024])
        {
            Caption = 'Bitcoin Wallet Descriptor';
            ToolTip = 'Specifies the wallet''s extended public key (xpub, ypub or zpub) or output descriptor, such as wpkh([fingerprint/84h/0h/0h]xpub.../<0;1>/*). Bookie reads the wallet''s transactions with it. Never enter a private key (xprv).';
            DataClassification = CustomerContent;

            trigger OnValidate()
            begin
                Rec."Bitcoin Wallet Descriptor" := CopyStr(DelChr(Rec."Bitcoin Wallet Descriptor", '<>', ' '), 1, MaxStrLen(Rec."Bitcoin Wallet Descriptor"));
                if IsPrivateKey(Rec."Bitcoin Wallet Descriptor") then
                    Error(PrivateKeyErr);
            end;
        }
        field(50251; "Bitcoin Script Type"; Enum "Bookie BTC Script Type")
        {
            Caption = 'Bitcoin Script Type';
            ToolTip = 'Specifies which addresses a bare xpub makes. Leave it on Automatic for ypub, zpub and output descriptors, which already say so.';
            DataClassification = CustomerContent;
        }
    }

    var
        PrivateKeyErr: Label 'That is a private key. Bookie only needs the public key (xpub, ypub or zpub) or an output descriptor. Never enter a private key here.';

    local procedure IsPrivateKey(Value: Text): Boolean
    var
        Prefixes: List of [Text];
        Prefix: Text;
        Separators: Text;
        Position: Integer;
    begin
        Prefixes.AddRange('xprv', 'yprv', 'zprv', 'tprv', 'uprv', 'vprv');
        Separators := '(,]';
        foreach Prefix in Prefixes do begin
            if Value.StartsWith(Prefix) then
                exit(true);
            Position := StrPos(Value, Prefix);
            if Position > 1 then
                if StrPos(Separators, CopyStr(Value, Position - 1, 1)) > 0 then
                    exit(true);
        end;
        exit(false);
    end;
}
