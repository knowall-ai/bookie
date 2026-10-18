namespace KnowAll.Bookie;

/// <summary>
/// Request and result of one customer payment registration from Bookie. Temporary:
/// nothing is stored; the posted entries are the record of the payment.
/// </summary>
table 50200 "Bookie Payment Registration"
{
    Caption = 'Bookie Payment Registration';
    TableType = Temporary;
    DataClassification = SystemMetadata;

    fields
    {
        field(1; Id; Guid)
        {
            Caption = 'Id';
        }
        // Request: the posted sales invoice (by SystemId, or by number), the bank account
        // the money was paid into (by SystemId, or by number), the date and the amount.
        field(10; "Invoice Id"; Guid)
        {
            Caption = 'Invoice Id';
        }
        field(11; "Invoice No."; Code[20])
        {
            Caption = 'Invoice No.';
        }
        field(12; "Bank Account Id"; Guid)
        {
            Caption = 'Bank Account Id';
        }
        field(13; "Bank Account No."; Code[20])
        {
            Caption = 'Bank Account No.';
        }
        field(14; "Payment Date"; Date)
        {
            Caption = 'Payment Date';
        }
        field(15; Amount; Decimal)
        {
            Caption = 'Amount';
            AutoFormatType = 1;
        }
        field(16; "External Document No."; Code[35])
        {
            Caption = 'External Document No.';
        }
        // Result, filled in after posting.
        field(30; "Customer No."; Code[20])
        {
            Caption = 'Customer No.';
        }
        field(31; "Document No."; Code[20])
        {
            Caption = 'Document No.';
        }
        field(32; "Payment Entry No."; Integer)
        {
            Caption = 'Payment Entry No.';
        }
        field(33; "Invoice Remaining Amount"; Decimal)
        {
            Caption = 'Invoice Remaining Amount';
            AutoFormatType = 1;
        }
        field(34; "Invoice Closed"; Boolean)
        {
            Caption = 'Invoice Closed';
        }
    }

    keys
    {
        key(PK; Id)
        {
            Clustered = true;
        }
    }
}
