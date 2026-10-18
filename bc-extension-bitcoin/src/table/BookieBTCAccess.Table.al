namespace KnowAll.Bookie.Bitcoin;

/// <summary>
/// Holds no data. Its only purpose is a permission check: BOOKIE BTC READ grants read
/// on it and BOOKIE BTC EDIT grants write, so the Bank Account Card shows the Bitcoin
/// wallet group only to users with one of those permission sets (including through a
/// security group), and lets only BOOKIE BTC EDIT change it.
/// </summary>
table 50250 "Bookie BTC Access"
{
    Caption = 'Bookie BTC Access';
    DataClassification = SystemMetadata;
    Access = Internal;

    fields
    {
        field(1; "Primary Key"; Code[10])
        {
            Caption = 'Primary Key';
        }
    }

    keys
    {
        key(PK; "Primary Key")
        {
            Clustered = true;
        }
    }
}
