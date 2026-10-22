namespace KnowAll.Bookie;

using Microsoft.Bank.BankAccount;
using Microsoft.Bank.Ledger;
using Microsoft.Bank.Reconciliation;
using Microsoft.Bank.Statement;
using Microsoft.Finance.GeneralLedger.Account;

/// <summary>
/// Bank accounts with the balances API v2.0 leaves out: the bank ledger balance, the
/// balance of the G/L account the bank's posting group uses, the last posted
/// statement, the open reconciliation and the number of unreconciled entries.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/bankAccountBalances
/// Ids match API v2.0 bankAccounts (the Bank Account SystemId).
/// </summary>
page 50200 "Bookie Bank Acc. Balances API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'bankAccountBalance';
    EntitySetName = 'bankAccountBalances';
    EntityCaption = 'Bank Account Balance';
    EntitySetCaption = 'Bank Account Balances';
    PageType = API;
    SourceTable = "Bank Account";
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
                field(bankAccountNumber; Rec."Bank Account No.")
                {
                    Caption = 'Bank Account No.';
                }
                field(iban; Rec.IBAN)
                {
                    Caption = 'IBAN';
                }
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                field(blocked; Rec.Blocked)
                {
                    Caption = 'Blocked';
                }
                field(bankAccPostingGroup; Rec."Bank Acc. Posting Group")
                {
                    Caption = 'Bank Acc. Posting Group';
                }
                // Bank ledger balance in the account's own currency (blank currencyCode = LCY).
                field(balance; Rec.Balance)
                {
                    Caption = 'Balance';
                }
                field(balanceLcy; Rec."Balance (LCY)")
                {
                    Caption = 'Balance (LCY)';
                }
                field(glAccountNumber; GLAccountNo)
                {
                    Caption = 'G/L Account No.';
                }
                // Balance of the G/L account behind the posting group, in LCY. That account can be
                // shared by several bank accounts, so it is only the bank's balance when it isn't.
                field(glBalance; GLBalance)
                {
                    Caption = 'G/L Balance (LCY)';
                    AutoFormatType = 1;
                }
                field(glAccountShared; GLAccountShared)
                {
                    Caption = 'G/L Account Shared';
                }
                field(lastStatementNumber; Rec."Last Statement No.")
                {
                    Caption = 'Last Statement No.';
                }
                field(lastStatementBalance; Rec."Balance Last Statement")
                {
                    Caption = 'Balance Last Statement';
                }
                field(lastStatementDate; LastStatementDate)
                {
                    Caption = 'Last Statement Date';
                }
                field(openReconciliationStatementNumber; OpenReconciliationNo)
                {
                    Caption = 'Open Reconciliation Statement No.';
                }
                field(openReconciliationStatementDate; OpenReconciliationDate)
                {
                    Caption = 'Open Reconciliation Statement Date';
                }
                field(openReconciliationEndingBalance; OpenReconciliationBalance)
                {
                    Caption = 'Open Reconciliation Ending Balance';
                    AutoFormatType = 1;
                }
                // Bank ledger entries not yet applied in a bank reconciliation.
                field(unreconciledEntries; UnreconciledEntries)
                {
                    Caption = 'Unreconciled Entries';
                }
                field(lastModifiedDateTime; Rec.SystemModifiedAt)
                {
                    Caption = 'Last Modified DateTime';
                }
            }
        }
    }

    var
        GLAccountNo: Code[20];
        GLBalance: Decimal;
        GLAccountShared: Boolean;
        LastStatementDate: Date;
        OpenReconciliationNo: Code[20];
        OpenReconciliationDate: Date;
        OpenReconciliationBalance: Decimal;
        UnreconciledEntries: Integer;

    trigger OnAfterGetRecord()
    begin
        Rec.CalcFields(Balance, "Balance (LCY)");
        CalcGLBalance();
        CalcStatements();
        CalcUnreconciled();
    end;

    local procedure CalcGLBalance()
    var
        BankAccountPostingGroup: Record "Bank Account Posting Group";
        GLAccount: Record "G/L Account";
        OtherBankAccount: Record "Bank Account";
        OtherPostingGroup: Record "Bank Account Posting Group";
    begin
        GLAccountNo := '';
        GLBalance := 0;
        GLAccountShared := false;
        if Rec."Bank Acc. Posting Group" = '' then
            exit;
        if not BankAccountPostingGroup.Get(Rec."Bank Acc. Posting Group") then
            exit;
        GLAccountNo := BankAccountPostingGroup."G/L Account No.";
        if (GLAccountNo = '') or not GLAccount.Get(GLAccountNo) then
            exit;
        GLAccount.CalcFields(Balance);
        GLBalance := GLAccount.Balance;

        OtherBankAccount.SetFilter("No.", '<>%1', Rec."No.");
        OtherBankAccount.SetFilter("Bank Acc. Posting Group", '<>%1', '');
        if OtherBankAccount.FindSet() then
            repeat
                if OtherPostingGroup.Get(OtherBankAccount."Bank Acc. Posting Group") then
                    if OtherPostingGroup."G/L Account No." = GLAccountNo then
                        GLAccountShared := true;
            until GLAccountShared or (OtherBankAccount.Next() = 0);
    end;

    local procedure CalcStatements()
    var
        BankAccountStatement: Record "Bank Account Statement";
        BankAccReconciliation: Record "Bank Acc. Reconciliation";
    begin
        LastStatementDate := 0D;
        OpenReconciliationNo := '';
        OpenReconciliationDate := 0D;
        OpenReconciliationBalance := 0;

        if Rec."Last Statement No." <> '' then
            if BankAccountStatement.Get(Rec."No.", Rec."Last Statement No.") then
                LastStatementDate := BankAccountStatement."Statement Date";

        BankAccReconciliation.SetRange("Statement Type", BankAccReconciliation."Statement Type"::"Bank Reconciliation");
        BankAccReconciliation.SetRange("Bank Account No.", Rec."No.");
        if BankAccReconciliation.FindLast() then begin
            OpenReconciliationNo := BankAccReconciliation."Statement No.";
            OpenReconciliationDate := BankAccReconciliation."Statement Date";
            OpenReconciliationBalance := BankAccReconciliation."Statement Ending Balance";
        end;
    end;

    local procedure CalcUnreconciled()
    var
        BankAccountLedgerEntry: Record "Bank Account Ledger Entry";
    begin
        BankAccountLedgerEntry.SetRange("Bank Account No.", Rec."No.");
        BankAccountLedgerEntry.SetRange(Open, true);
        BankAccountLedgerEntry.SetRange(Reversed, false);
        UnreconciledEntries := BankAccountLedgerEntry.Count();
    end;
}
