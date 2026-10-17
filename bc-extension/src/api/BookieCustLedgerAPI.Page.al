namespace KnowAll.Bookie;

using Microsoft.Sales.Customer;
using Microsoft.Sales.Receivables;

/// <summary>
/// Customer ledger entries with their remaining amounts, so Bookie can show the true
/// amount due on an invoice and build exact aged receivables. API v2.0 has no
/// customer ledger entity, and its aging report has no per-document remaining amount.
///
/// remainingAmount is a FlowField over the detailed entries: add `dateFilter le {date}`
/// to the filter for the amount remaining as at that date (aged reports at a past date).
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/customerLedgerEntries
/// </summary>
page 50202 "Bookie Cust. Ledger API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'customerLedgerEntry';
    EntitySetName = 'customerLedgerEntries';
    EntityCaption = 'Customer Ledger Entry';
    EntitySetCaption = 'Customer Ledger Entries';
    PageType = API;
    SourceTable = "Cust. Ledger Entry";
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
                field(customerNumber; Rec."Customer No.")
                {
                    Caption = 'Customer No.';
                }
                // The Customer SystemId, i.e. the id API v2.0 customers use.
                field(customerId; CustomerId)
                {
                    Caption = 'Customer Id';
                }
                field(customerName; Rec."Customer Name")
                {
                    Caption = 'Customer Name';
                }
                field(postingDate; Rec."Posting Date")
                {
                    Caption = 'Posting Date';
                }
                field(documentDate; Rec."Document Date")
                {
                    Caption = 'Document Date';
                }
                field(dueDate; Rec."Due Date")
                {
                    Caption = 'Due Date';
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
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                field(amount; Rec.Amount)
                {
                    Caption = 'Amount';
                }
                field(amountLcy; Rec."Amount (LCY)")
                {
                    Caption = 'Amount (LCY)';
                }
                field(originalAmount; Rec."Original Amount")
                {
                    Caption = 'Original Amount';
                }
                field(remainingAmount; Rec."Remaining Amount")
                {
                    Caption = 'Remaining Amount';
                }
                field(remainingAmountLcy; Rec."Remaining Amt. (LCY)")
                {
                    Caption = 'Remaining Amount (LCY)';
                }
                field(open; Rec.Open)
                {
                    Caption = 'Open';
                }
                field(onHold; Rec."On Hold")
                {
                    Caption = 'On Hold';
                }
                field(closedAtDate; Rec."Closed at Date")
                {
                    Caption = 'Closed at Date';
                }
                field(reversed; Rec.Reversed)
                {
                    Caption = 'Reversed';
                }
                field(dateFilter; Rec."Date Filter")
                {
                    Caption = 'Date Filter';
                }
                field(lastModifiedDateTime; Rec.SystemModifiedAt)
                {
                    Caption = 'Last Modified DateTime';
                }
            }
        }
    }

    var
        CustomerId: Guid;
        LastCustomerNo: Code[20];

    trigger OnAfterGetRecord()
    var
        Customer: Record Customer;
    begin
        Rec.CalcFields(Amount, "Amount (LCY)", "Original Amount", "Remaining Amount", "Remaining Amt. (LCY)");
        if Rec."Customer No." = LastCustomerNo then
            exit;
        LastCustomerNo := Rec."Customer No.";
        Clear(CustomerId);
        Customer.SetLoadFields("No.");
        if Customer.Get(Rec."Customer No.") then
            CustomerId := Customer.SystemId;
    end;
}
