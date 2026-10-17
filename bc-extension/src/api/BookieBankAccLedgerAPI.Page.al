namespace KnowAll.Bookie;

using Microsoft.Bank.Ledger;

/// <summary>
/// Posted bank account ledger entries, for Bookie's bank transaction lists. API v2.0
/// has no bank ledger entity. Filter on bankAccountNumber and order by postingDate.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/bankAccountLedgerEntries
/// </summary>
page 50201 "Bookie Bank Acc. Ledger API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'bankAccountLedgerEntry';
    EntitySetName = 'bankAccountLedgerEntries';
    EntityCaption = 'Bank Account Ledger Entry';
    EntitySetCaption = 'Bank Account Ledger Entries';
    PageType = API;
    SourceTable = "Bank Account Ledger Entry";
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
                field(entryNumber; Rec."Entry No.")
                {
                    Caption = 'Entry No.';
                }
                field(bankAccountNumber; Rec."Bank Account No.")
                {
                    Caption = 'Bank Account No.';
                }
                field(postingDate; Rec."Posting Date")
                {
                    Caption = 'Posting Date';
                }
                field(documentDate; Rec."Document Date")
                {
                    Caption = 'Document Date';
                }
                field(documentType; Rec."Document Type")
                {
                    Caption = 'Document Type';
                }
                field(documentNumber; Rec."Document No.")
                {
                    Caption = 'Document No.';
                }
                field(externalDocumentNumber; Rec."External Document No.")
                {
                    Caption = 'External Document No.';
                }
                field(description; Rec.Description)
                {
                    Caption = 'Description';
                }
                // In the bank account's currency (currencyCode; blank = LCY). Positive = money in.
                field(amount; Rec.Amount)
                {
                    Caption = 'Amount';
                }
                field(amountLcy; Rec."Amount (LCY)")
                {
                    Caption = 'Amount (LCY)';
                }
                field(debitAmount; Rec."Debit Amount")
                {
                    Caption = 'Debit Amount';
                }
                field(creditAmount; Rec."Credit Amount")
                {
                    Caption = 'Credit Amount';
                }
                field(remainingAmount; Rec."Remaining Amount")
                {
                    Caption = 'Remaining Amount';
                }
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                // Open = not yet applied in a bank reconciliation.
                field(open; Rec.Open)
                {
                    Caption = 'Open';
                }
                field(statementStatus; Rec."Statement Status")
                {
                    Caption = 'Statement Status';
                }
                field(statementNumber; Rec."Statement No.")
                {
                    Caption = 'Statement No.';
                }
                field(closedAtDate; Rec."Closed at Date")
                {
                    Caption = 'Closed at Date';
                }
                field(balAccountType; Rec."Bal. Account Type")
                {
                    Caption = 'Bal. Account Type';
                }
                field(balAccountNumber; Rec."Bal. Account No.")
                {
                    Caption = 'Bal. Account No.';
                }
                field(sourceCode; Rec."Source Code")
                {
                    Caption = 'Source Code';
                }
                field(reversed; Rec.Reversed)
                {
                    Caption = 'Reversed';
                }
                field(lastModifiedDateTime; Rec.SystemModifiedAt)
                {
                    Caption = 'Last Modified DateTime';
                }
            }
        }
    }
}
