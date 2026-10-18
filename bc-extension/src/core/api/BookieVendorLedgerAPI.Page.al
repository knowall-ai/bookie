namespace KnowAll.Bookie;

using Microsoft.Purchases.Payables;
using Microsoft.Purchases.Vendor;

/// <summary>
/// Vendor ledger entries with their remaining amounts, so Bookie can show the true
/// amount due on a bill (API v2.0 purchaseInvoices has no remaining amount) and build
/// exact aged payables. API v2.0 has no vendor ledger entity.
///
/// remainingAmount is a FlowField over the detailed entries: add `dateFilter le {date}`
/// to the filter for the amount remaining as at that date (aged reports at a past date).
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/vendorLedgerEntries
/// </summary>
page 50203 "Bookie Vendor Ledger API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'vendorLedgerEntry';
    EntitySetName = 'vendorLedgerEntries';
    EntityCaption = 'Vendor Ledger Entry';
    EntitySetCaption = 'Vendor Ledger Entries';
    PageType = API;
    SourceTable = "Vendor Ledger Entry";
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
                field(vendorNumber; Rec."Vendor No.")
                {
                    Caption = 'Vendor No.';
                }
                // The Vendor SystemId, i.e. the id API v2.0 vendors use.
                field(vendorId; VendorId)
                {
                    Caption = 'Vendor Id';
                }
                field(vendorName; Rec."Vendor Name")
                {
                    Caption = 'Vendor Name';
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
        VendorId: Guid;
        LastVendorNo: Code[20];

    trigger OnAfterGetRecord()
    var
        Vendor: Record Vendor;
    begin
        Rec.CalcFields(Amount, "Amount (LCY)", "Original Amount", "Remaining Amount", "Remaining Amt. (LCY)");
        if Rec."Vendor No." = LastVendorNo then
            exit;
        LastVendorNo := Rec."Vendor No.";
        Clear(VendorId);
        Vendor.SetLoadFields("No.");
        if Vendor.Get(Rec."Vendor No.") then
            VendorId := Vendor.SystemId;
    end;
}
