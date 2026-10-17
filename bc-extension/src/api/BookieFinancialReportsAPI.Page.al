namespace KnowAll.Bookie;

using Microsoft.Finance.FinancialReports;

/// <summary>
/// The company's financial reports (Financial Report definitions), so Bookie can find
/// the row definition behind each report. companySetup says which ones General Ledger
/// Setup uses for the income statement and balance sheet.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/financialReports
/// </summary>
page 50206 "Bookie Financial Reports API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'financialReport';
    EntitySetName = 'financialReports';
    EntityCaption = 'Financial Report';
    EntitySetCaption = 'Financial Reports';
    PageType = API;
    SourceTable = "Financial Report";
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
                field(name; Rec.Name)
                {
                    Caption = 'Name';
                }
                field(description; Rec.Description)
                {
                    Caption = 'Description';
                }
                field(rowDefinition; Rec."Financial Report Row Group")
                {
                    Caption = 'Row Definition';
                }
                field(columnDefinition; Rec."Financial Report Column Group")
                {
                    Caption = 'Column Definition';
                }
                field(lastModifiedDateTime; Rec.SystemModifiedAt)
                {
                    Caption = 'Last Modified DateTime';
                }
            }
        }
    }
}
