namespace KnowAll.Bookie;

/// <summary>
/// Register a customer payment against one open posted sales invoice, posted by BC's
/// Payment Registration (see codeunit "Bookie Payment Registration" for the safety
/// checks). POST only; nothing is stored, the response carries the posted result.
///
/// POST /api/knowallBookie/bookie/v1.0/companies({companyId})/paymentRegistrations
/// { "invoiceId": "...", "bankAccountId": "...", "paymentDate": "2026-10-17",
///   "amount": 120.00, "externalDocumentNumber": "Optional reference" }
/// </summary>
page 50209 "Bookie Payment Registr. API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'paymentRegistration';
    EntitySetName = 'paymentRegistrations';
    EntityCaption = 'Payment Registration';
    EntitySetCaption = 'Payment Registrations';
    PageType = API;
    SourceTable = "Bookie Payment Registration";
    SourceTableTemporary = true;
    ODataKeyFields = Id;
    DelayedInsert = true;
    InsertAllowed = true;
    ModifyAllowed = false;
    DeleteAllowed = false;
    Extensible = false;

    layout
    {
        area(Content)
        {
            repeater(Group)
            {
                field(id; Rec.Id)
                {
                    Caption = 'Id';
                    Editable = false;
                }
                field(invoiceId; Rec."Invoice Id")
                {
                    Caption = 'Invoice Id';
                }
                field(invoiceNumber; Rec."Invoice No.")
                {
                    Caption = 'Invoice No.';
                }
                field(bankAccountId; Rec."Bank Account Id")
                {
                    Caption = 'Bank Account Id';
                }
                field(bankAccountNumber; Rec."Bank Account No.")
                {
                    Caption = 'Bank Account No.';
                }
                field(paymentDate; Rec."Payment Date")
                {
                    Caption = 'Payment Date';
                }
                field(amount; Rec.Amount)
                {
                    Caption = 'Amount';
                }
                field(externalDocumentNumber; Rec."External Document No.")
                {
                    Caption = 'External Document No.';
                }
                field(customerNumber; Rec."Customer No.")
                {
                    Caption = 'Customer No.';
                    Editable = false;
                }
                field(documentNumber; Rec."Document No.")
                {
                    Caption = 'Document No.';
                    Editable = false;
                }
                field(paymentLedgerEntryNumber; Rec."Payment Entry No.")
                {
                    Caption = 'Payment Ledger Entry No.';
                    Editable = false;
                }
                field(invoiceRemainingAmount; Rec."Invoice Remaining Amount")
                {
                    Caption = 'Invoice Remaining Amount';
                    Editable = false;
                }
                field(invoiceClosed; Rec."Invoice Closed")
                {
                    Caption = 'Invoice Closed';
                    Editable = false;
                }
            }
        }
    }

    trigger OnInsertRecord(BelowxRec: Boolean): Boolean
    var
        BookiePaymentRegistration: Codeunit "Bookie Payment Registration";
    begin
        Rec.Id := CreateGuid();
        BookiePaymentRegistration.Register(Rec);
        exit(true);
    end;
}
