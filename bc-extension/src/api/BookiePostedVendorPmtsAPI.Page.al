namespace KnowAll.Bookie;

using Microsoft.Bank.BankAccount;
using Microsoft.Finance.GeneralLedger.Journal;
using Microsoft.Purchases.History;
using Microsoft.Purchases.Payables;
using Microsoft.Purchases.Vendor;

/// <summary>
/// Posted vendor payments, as the detailed ledger entries that applied a payment to a
/// bill: one row per payment and bill it paid, with the amount applied. API v2.0
/// only has unposted payment journal lines (vendorPayments).
///
/// Rows are the "Application" detailed entries on invoice ledger entries whose document
/// type is Payment. Applications made later from the invoice side (Apply Entries on the
/// invoice) carry the invoice's document type and are not included; nor are payments
/// that are not applied to any invoice.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/postedVendorPayments
/// </summary>
page 50205 "Bookie Posted Vendor Pmts API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'postedVendorPayment';
    EntitySetName = 'postedVendorPayments';
    EntityCaption = 'Posted Vendor Payment';
    EntitySetCaption = 'Posted Vendor Payments';
    PageType = API;
    SourceTable = "Detailed Vendor Ledg. Entry";
    SourceTableView = where("Entry Type" = const(Application),
                            "Document Type" = const(Payment),
                            "Initial Document Type" = const(Invoice),
                            Unapplied = const(false));
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
                field(postingDate; Rec."Posting Date")
                {
                    Caption = 'Posting Date';
                }
                field(paymentNumber; Rec."Document No.")
                {
                    Caption = 'Payment Document No.';
                }
                field(externalDocumentNumber; ExternalDocumentNo)
                {
                    Caption = 'External Document No.';
                }
                field(vendorNumber; Rec."Vendor No.")
                {
                    Caption = 'Vendor No.';
                }
                field(vendorId; VendorId)
                {
                    Caption = 'Vendor Id';
                }
                field(vendorName; VendorName)
                {
                    Caption = 'Vendor Name';
                }
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                // Amount of the bill this payment settled, positive, in the entry's currency.
                field(amount; Amount)
                {
                    Caption = 'Amount';
                    AutoFormatType = 1;
                }
                field(amountLcy; AmountLCY)
                {
                    Caption = 'Amount (LCY)';
                    AutoFormatType = 1;
                }
                field(invoiceLedgerEntryNumber; Rec."Vendor Ledger Entry No.")
                {
                    Caption = 'Invoice Ledger Entry No.';
                }
                field(invoiceNumber; InvoiceNo)
                {
                    Caption = 'Invoice No.';
                }
                // The posted Purch. Inv. Header SystemId, i.e. the id API v2.0 purchaseInvoices use.
                field(invoiceId; InvoiceId)
                {
                    Caption = 'Invoice Id';
                }
                field(paymentLedgerEntryNumber; PaymentEntryNo)
                {
                    Caption = 'Payment Ledger Entry No.';
                }
                // The bank the payment was posted to, when it was balanced against a bank account.
                field(bankAccountNumber; BankAccountNo)
                {
                    Caption = 'Bank Account No.';
                }
                field(bankAccountId; BankAccountId)
                {
                    Caption = 'Bank Account Id';
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
        VendorName: Text[100];
        LastVendorNo: Code[20];
        Amount: Decimal;
        AmountLCY: Decimal;
        InvoiceNo: Code[20];
        InvoiceId: Guid;
        PaymentEntryNo: Integer;
        ExternalDocumentNo: Code[35];
        BankAccountNo: Code[20];
        BankAccountId: Guid;

    trigger OnAfterGetRecord()
    begin
        Amount := Abs(Rec.Amount);
        AmountLCY := Abs(Rec."Amount (LCY)");
        LookupVendor();
        LookupInvoice();
        LookupPayment();
    end;

    local procedure LookupVendor()
    var
        Vendor: Record Vendor;
    begin
        if Rec."Vendor No." = LastVendorNo then
            exit;
        LastVendorNo := Rec."Vendor No.";
        Clear(VendorId);
        VendorName := '';
        Vendor.SetLoadFields("No.", Name);
        if Vendor.Get(Rec."Vendor No.") then begin
            VendorId := Vendor.SystemId;
            VendorName := Vendor.Name;
        end;
    end;

    local procedure LookupInvoice()
    var
        InvoiceEntry: Record "Vendor Ledger Entry";
        PurchInvHeader: Record "Purch. Inv. Header";
    begin
        InvoiceNo := '';
        Clear(InvoiceId);
        InvoiceEntry.SetLoadFields("Document No.");
        if not InvoiceEntry.Get(Rec."Vendor Ledger Entry No.") then
            exit;
        InvoiceNo := InvoiceEntry."Document No.";
        PurchInvHeader.SetLoadFields("No.");
        if PurchInvHeader.Get(InvoiceNo) then
            InvoiceId := PurchInvHeader.SystemId;
    end;

    local procedure LookupPayment()
    var
        PaymentEntry: Record "Vendor Ledger Entry";
        BankAccount: Record "Bank Account";
    begin
        PaymentEntryNo := 0;
        ExternalDocumentNo := '';
        BankAccountNo := '';
        Clear(BankAccountId);
        PaymentEntry.SetLoadFields("Entry No.", "External Document No.", "Bal. Account Type", "Bal. Account No.");
        PaymentEntry.SetRange("Vendor No.", Rec."Vendor No.");
        PaymentEntry.SetRange("Document Type", PaymentEntry."Document Type"::Payment);
        PaymentEntry.SetRange("Document No.", Rec."Document No.");
        if not PaymentEntry.FindFirst() then
            exit;
        PaymentEntryNo := PaymentEntry."Entry No.";
        ExternalDocumentNo := PaymentEntry."External Document No.";
        if PaymentEntry."Bal. Account Type" <> PaymentEntry."Bal. Account Type"::"Bank Account" then
            exit;
        BankAccountNo := PaymentEntry."Bal. Account No.";
        BankAccount.SetLoadFields("No.");
        if BankAccount.Get(BankAccountNo) then
            BankAccountId := BankAccount.SystemId;
    end;
}
