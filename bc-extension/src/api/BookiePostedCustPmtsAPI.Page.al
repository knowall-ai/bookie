namespace KnowAll.Bookie;

using Microsoft.Bank.BankAccount;
using Microsoft.Finance.GeneralLedger.Journal;
using Microsoft.Sales.Customer;
using Microsoft.Sales.History;
using Microsoft.Sales.Receivables;

/// <summary>
/// Posted customer payments, as the detailed ledger entries that applied a payment to an
/// invoice: one row per payment and invoice it paid, with the amount applied. API v2.0
/// only has unposted payment journal lines (customerPayments).
///
/// Rows are the "Application" detailed entries on invoice ledger entries whose document
/// type is Payment. Applications made later from the invoice side (Apply Entries on the
/// invoice) carry the invoice's document type and are not included; nor are payments
/// that are not applied to any invoice.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/postedCustomerPayments
/// </summary>
page 50204 "Bookie Posted Cust. Pmts API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'postedCustomerPayment';
    EntitySetName = 'postedCustomerPayments';
    EntityCaption = 'Posted Customer Payment';
    EntitySetCaption = 'Posted Customer Payments';
    PageType = API;
    SourceTable = "Detailed Cust. Ledg. Entry";
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
                field(customerNumber; Rec."Customer No.")
                {
                    Caption = 'Customer No.';
                }
                field(customerId; CustomerId)
                {
                    Caption = 'Customer Id';
                }
                field(customerName; CustomerName)
                {
                    Caption = 'Customer Name';
                }
                field(currencyCode; Rec."Currency Code")
                {
                    Caption = 'Currency Code';
                }
                // Amount of the invoice this payment settled, positive, in the entry's currency.
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
                field(invoiceLedgerEntryNumber; Rec."Cust. Ledger Entry No.")
                {
                    Caption = 'Invoice Ledger Entry No.';
                }
                field(invoiceNumber; InvoiceNo)
                {
                    Caption = 'Invoice No.';
                }
                // The posted Sales Invoice Header SystemId, i.e. the id API v2.0 salesInvoices use.
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
        CustomerId: Guid;
        CustomerName: Text[100];
        LastCustomerNo: Code[20];
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
        LookupCustomer();
        LookupInvoice();
        LookupPayment();
    end;

    local procedure LookupCustomer()
    var
        Customer: Record Customer;
    begin
        if Rec."Customer No." = LastCustomerNo then
            exit;
        LastCustomerNo := Rec."Customer No.";
        Clear(CustomerId);
        CustomerName := '';
        Customer.SetLoadFields("No.", Name);
        if Customer.Get(Rec."Customer No.") then begin
            CustomerId := Customer.SystemId;
            CustomerName := Customer.Name;
        end;
    end;

    local procedure LookupInvoice()
    var
        InvoiceEntry: Record "Cust. Ledger Entry";
        SalesInvoiceHeader: Record "Sales Invoice Header";
    begin
        InvoiceNo := '';
        Clear(InvoiceId);
        InvoiceEntry.SetLoadFields("Document No.");
        if not InvoiceEntry.Get(Rec."Cust. Ledger Entry No.") then
            exit;
        InvoiceNo := InvoiceEntry."Document No.";
        SalesInvoiceHeader.SetLoadFields("No.");
        if SalesInvoiceHeader.Get(InvoiceNo) then
            InvoiceId := SalesInvoiceHeader.SystemId;
    end;

    local procedure LookupPayment()
    var
        PaymentEntry: Record "Cust. Ledger Entry";
        BankAccount: Record "Bank Account";
    begin
        PaymentEntryNo := 0;
        ExternalDocumentNo := '';
        BankAccountNo := '';
        Clear(BankAccountId);
        PaymentEntry.SetLoadFields("Entry No.", "External Document No.", "Bal. Account Type", "Bal. Account No.");
        PaymentEntry.SetRange("Customer No.", Rec."Customer No.");
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
