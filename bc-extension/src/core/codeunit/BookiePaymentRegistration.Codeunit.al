namespace KnowAll.Bookie;

using Microsoft.Bank.BankAccount;
using Microsoft.Bank.Payment;
using Microsoft.Finance.GeneralLedger.Journal;
using Microsoft.Finance.GeneralLedger.Posting;
using Microsoft.Foundation.NoSeries;
using Microsoft.Sales.History;
using Microsoft.Sales.Receivables;

/// <summary>
/// Registers one customer payment against one open posted sales invoice.
///
/// Why not call codeunit "Payment Registration Mgt." directly: its Post procedure is
/// Scope('OnPrem'), so a cloud extension can't call it, and ConfirmPost asks the user to
/// confirm, which fails in an API session. Post also posts the whole journal batch in the
/// user's Payment Registration Setup, so it could post other people's unposted lines.
///
/// Instead this builds the same payment line Payment Registration would (the user's
/// Payment Registration Setup supplies the journal template, batch and number series;
/// the payment is applied to the invoice and balanced against the chosen bank account)
/// and posts that single line with "Gen. Jnl.-Post Line".RunWithCheck. The line is never
/// inserted into the batch, so nothing else is posted, and the API call is one
/// transaction: if any check or the posting fails, nothing is posted and the number
/// series is not advanced.
///
/// The amount can't exceed the invoice's remaining amount, and only local-currency
/// invoices and bank accounts are accepted.
/// </summary>
codeunit 50200 "Bookie Payment Registration"
{
    Access = Internal;

    var
        AmountErr: Label 'Enter an amount above zero.';
        DateErr: Label 'Enter the date the payment was received.';
        InvoiceNotFoundErr: Label 'The posted sales invoice was not found.';
        InvoiceEntryNotFoundErr: Label 'The customer ledger entry for invoice %1 was not found.', Comment = '%1 = invoice number';
        InvoiceClosedErr: Label 'Invoice %1 is already fully paid.', Comment = '%1 = invoice number';
        ForeignCurrencyErr: Label 'Invoice %1 is in %2. Bookie can only register payments in the local currency; register this one in Business Central.', Comment = '%1 = invoice number, %2 = currency code';
        OverpaymentErr: Label 'The payment (%1) is more than the amount remaining on invoice %2 (%3).', Comment = '%1 = amount, %2 = invoice number, %3 = remaining amount';
        BankNotFoundErr: Label 'The bank account was not found.';
        BankBlockedErr: Label 'Bank account %1 is blocked.', Comment = '%1 = bank account number';
        BankCurrencyErr: Label 'Bank account %1 is in %2. Bookie can only register payments into local-currency bank accounts.', Comment = '%1 = bank account number, %2 = currency code';
        SetupMissingErr: Label 'Payment Registration is not set up for you in this company. Open Payment Registration Setup in Business Central, choose a journal template and batch, then try again.';
        NoSeriesMissingErr: Label 'The journal batch %1 %2 in your Payment Registration Setup has no number series. Add one in Business Central, then try again.', Comment = '%1 = journal template, %2 = journal batch';
        NotPostedErr: Label 'Business Central did not post a payment for invoice %1.', Comment = '%1 = invoice number';

    procedure Register(var Registration: Record "Bookie Payment Registration")
    var
        InvoiceEntry: Record "Cust. Ledger Entry";
        BankAccount: Record "Bank Account";
        PaymentRegistrationSetup: Record "Payment Registration Setup";
        GenJournalLine: Record "Gen. Journal Line";
        GenJnlPostLine: Codeunit "Gen. Jnl.-Post Line";
    begin
        if Registration.Amount <= 0 then
            Error(AmountErr);
        if Registration."Payment Date" = 0D then
            Error(DateErr);

        FindOpenInvoiceEntry(Registration, InvoiceEntry);
        FindBankAccount(Registration, BankAccount);
        GetPaymentRegistrationSetup(PaymentRegistrationSetup);

        BuildPaymentLine(GenJournalLine, Registration, InvoiceEntry, BankAccount, PaymentRegistrationSetup);
        GenJnlPostLine.RunWithCheck(GenJournalLine);

        FillResult(Registration, InvoiceEntry, GenJournalLine."Document No.");
    end;

    local procedure FindOpenInvoiceEntry(var Registration: Record "Bookie Payment Registration"; var InvoiceEntry: Record "Cust. Ledger Entry")
    var
        SalesInvoiceHeader: Record "Sales Invoice Header";
    begin
        if not IsNullGuid(Registration."Invoice Id") then begin
            if not SalesInvoiceHeader.GetBySystemId(Registration."Invoice Id") then
                Error(InvoiceNotFoundErr);
        end else
            if (Registration."Invoice No." = '') or not SalesInvoiceHeader.Get(Registration."Invoice No.") then
                Error(InvoiceNotFoundErr);
        Registration."Invoice Id" := SalesInvoiceHeader.SystemId;
        Registration."Invoice No." := SalesInvoiceHeader."No.";

        InvoiceEntry.SetRange("Document Type", InvoiceEntry."Document Type"::Invoice);
        InvoiceEntry.SetRange("Document No.", SalesInvoiceHeader."No.");
        InvoiceEntry.SetRange("Customer No.", SalesInvoiceHeader."Bill-to Customer No.");
        if not InvoiceEntry.FindFirst() then
            Error(InvoiceEntryNotFoundErr, SalesInvoiceHeader."No.");
        if not InvoiceEntry.Open then
            Error(InvoiceClosedErr, SalesInvoiceHeader."No.");
        if InvoiceEntry."Currency Code" <> '' then
            Error(ForeignCurrencyErr, SalesInvoiceHeader."No.", InvoiceEntry."Currency Code");
        InvoiceEntry.CalcFields("Remaining Amount");
        if Registration.Amount > InvoiceEntry."Remaining Amount" then
            Error(OverpaymentErr, Registration.Amount, SalesInvoiceHeader."No.", InvoiceEntry."Remaining Amount");
        Registration."Customer No." := InvoiceEntry."Customer No.";
    end;

    local procedure FindBankAccount(var Registration: Record "Bookie Payment Registration"; var BankAccount: Record "Bank Account")
    begin
        if not IsNullGuid(Registration."Bank Account Id") then begin
            if not BankAccount.GetBySystemId(Registration."Bank Account Id") then
                Error(BankNotFoundErr);
        end else
            if (Registration."Bank Account No." = '') or not BankAccount.Get(Registration."Bank Account No.") then
                Error(BankNotFoundErr);
        if BankAccount.Blocked then
            Error(BankBlockedErr, BankAccount."No.");
        if BankAccount."Currency Code" <> '' then
            Error(BankCurrencyErr, BankAccount."No.", BankAccount."Currency Code");
        Registration."Bank Account Id" := BankAccount.SystemId;
        Registration."Bank Account No." := BankAccount."No.";
    end;

    /// <summary>
    /// The signed-in user's Payment Registration Setup. Like the Payment Registration page,
    /// a user without one gets a copy of the company default (the setup with a blank user).
    /// </summary>
    local procedure GetPaymentRegistrationSetup(var PaymentRegistrationSetup: Record "Payment Registration Setup")
    var
        DefaultSetup: Record "Payment Registration Setup";
    begin
        if not PaymentRegistrationSetup.Get(UserId()) then begin
            if not DefaultSetup.Get('') then
                Error(SetupMissingErr);
            PaymentRegistrationSetup := DefaultSetup;
            PaymentRegistrationSetup."User ID" := CopyStr(UserId(), 1, MaxStrLen(PaymentRegistrationSetup."User ID"));
            PaymentRegistrationSetup.Insert(true);
        end;
        PaymentRegistrationSetup.ValidateMandatoryFields(true);
    end;

    local procedure BuildPaymentLine(var GenJournalLine: Record "Gen. Journal Line"; Registration: Record "Bookie Payment Registration"; InvoiceEntry: Record "Cust. Ledger Entry"; BankAccount: Record "Bank Account"; PaymentRegistrationSetup: Record "Payment Registration Setup")
    var
        GenJournalTemplate: Record "Gen. Journal Template";
        GenJournalBatch: Record "Gen. Journal Batch";
        NoSeries: Codeunit "No. Series";
        NoSeriesCode: Code[20];
    begin
        GenJournalTemplate.Get(PaymentRegistrationSetup."Journal Template Name");
        GenJournalBatch.Get(PaymentRegistrationSetup."Journal Template Name", PaymentRegistrationSetup."Journal Batch Name");
        NoSeriesCode := GenJournalBatch."Posting No. Series";
        if NoSeriesCode = '' then
            NoSeriesCode := GenJournalBatch."No. Series";
        if NoSeriesCode = '' then
            Error(NoSeriesMissingErr, GenJournalBatch."Journal Template Name", GenJournalBatch.Name);

        GenJournalLine.Init();
        GenJournalLine."Journal Template Name" := GenJournalBatch."Journal Template Name";
        GenJournalLine."Journal Batch Name" := GenJournalBatch.Name;
        GenJournalLine."Source Code" := GenJournalTemplate."Source Code";
        GenJournalLine."Reason Code" := GenJournalBatch."Reason Code";
        GenJournalLine.Validate("Posting Date", Registration."Payment Date");
        GenJournalLine.Validate("Document Type", GenJournalLine."Document Type"::Payment);
        GenJournalLine."Document No." := NoSeries.GetNextNo(NoSeriesCode, Registration."Payment Date");
        GenJournalLine.Validate("Account Type", GenJournalLine."Account Type"::Customer);
        GenJournalLine.Validate("Account No.", InvoiceEntry."Customer No.");
        GenJournalLine.Validate("Bal. Account Type", GenJournalLine."Bal. Account Type"::"Bank Account");
        GenJournalLine.Validate("Bal. Account No.", BankAccount."No.");
        GenJournalLine.Validate("Currency Code", '');
        GenJournalLine.Validate(Amount, -Registration.Amount);
        GenJournalLine.Validate("Applies-to Doc. Type", GenJournalLine."Applies-to Doc. Type"::Invoice);
        GenJournalLine.Validate("Applies-to Doc. No.", InvoiceEntry."Document No.");
        if Registration."External Document No." <> '' then
            GenJournalLine."External Document No." := Registration."External Document No.";
    end;

    local procedure FillResult(var Registration: Record "Bookie Payment Registration"; InvoiceEntry: Record "Cust. Ledger Entry"; DocumentNo: Code[20])
    var
        PaymentEntry: Record "Cust. Ledger Entry";
    begin
        PaymentEntry.SetRange("Customer No.", InvoiceEntry."Customer No.");
        PaymentEntry.SetRange("Document Type", PaymentEntry."Document Type"::Payment);
        PaymentEntry.SetRange("Document No.", DocumentNo);
        if not PaymentEntry.FindLast() then
            Error(NotPostedErr, InvoiceEntry."Document No.");
        Registration."Payment Entry No." := PaymentEntry."Entry No.";
        Registration."Document No." := PaymentEntry."Document No.";

        InvoiceEntry.Find();
        InvoiceEntry.CalcFields("Remaining Amount");
        Registration."Invoice Remaining Amount" := InvoiceEntry."Remaining Amount";
        Registration."Invoice Closed" := not InvoiceEntry.Open;
    end;
}
