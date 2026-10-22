namespace KnowAll.Bookie;

using Microsoft.Finance.FinancialReports;

/// <summary>
/// The rows of a financial report row definition (Acc. Schedule Line) with their
/// amounts for a period, calculated by BC's own engine (AccSchedManagement.CalcCell),
/// so Bookie's P&amp;L and balance sheet follow each company's report setup instead of
/// API v2.0's fixed incomeStatements/balanceSheets.
///
/// Filter on rowDefinition and dateFilter, e.g.
///   $filter=rowDefinition eq 'I/S' and dateFilter ge 2026-01-01 and dateFilter le 2026-12-31
/// dateFilter is required. Amounts follow the row's "Show Opposite Sign", as BC shows them.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/financialReportLines
/// </summary>
page 50207 "Bookie Fin. Report Lines API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'financialReportLine';
    EntitySetName = 'financialReportLines';
    EntityCaption = 'Financial Report Line';
    EntitySetCaption = 'Financial Report Lines';
    PageType = API;
    SourceTable = "Acc. Schedule Line";
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
                field(rowDefinition; Rec."Schedule Name")
                {
                    Caption = 'Row Definition';
                }
                field(lineNumber; Rec."Line No.")
                {
                    Caption = 'Line No.';
                }
                field(rowNumber; Rec."Row No.")
                {
                    Caption = 'Row No.';
                }
                field(description; Rec.Description)
                {
                    Caption = 'Description';
                }
                field(totalingType; Rec."Totaling Type")
                {
                    Caption = 'Totaling Type';
                }
                field(totaling; Rec.Totaling)
                {
                    Caption = 'Totaling';
                }
                field(rowType; Rec."Row Type")
                {
                    Caption = 'Row Type';
                }
                field(amountType; Rec."Amount Type")
                {
                    Caption = 'Amount Type';
                }
                field(show; Rec.Show)
                {
                    Caption = 'Show';
                }
                field(showOppositeSign; Rec."Show Opposite Sign")
                {
                    Caption = 'Show Opposite Sign';
                }
                field(indentation; Rec.Indentation)
                {
                    Caption = 'Indentation';
                }
                field(bold; Rec.Bold)
                {
                    Caption = 'Bold';
                }
                field(italic; Rec.Italic)
                {
                    Caption = 'Italic';
                }
                field(underline; Rec.Underline)
                {
                    Caption = 'Underline';
                }
                field(doubleUnderline; Rec."Double Underline")
                {
                    Caption = 'Double Underline';
                }
                field(newPage; Rec."New Page")
                {
                    Caption = 'New Page';
                }
                field(dateFilter; Rec."Date Filter")
                {
                    Caption = 'Date Filter';
                }
                // Net change over dateFilter (the "Net Change" column BC's income statement uses).
                field(netChange; NetChange)
                {
                    Caption = 'Net Change';
                    AutoFormatType = 1;
                }
                // Balance at the end of dateFilter (the "Balance at Date" column a balance sheet uses).
                field(balanceAtDate; BalanceAtDate)
                {
                    Caption = 'Balance at Date';
                    AutoFormatType = 1;
                }
            }
        }
    }

    var
        TempNetChangeColumn: Record "Column Layout" temporary;
        TempBalanceColumn: Record "Column Layout" temporary;
        AccSchedManagement: Codeunit AccSchedManagement;
        ColumnsReady: Boolean;
        NetChange: Decimal;
        BalanceAtDate: Decimal;
        DateFilterRequiredErr: Label 'Filter financialReportLines on dateFilter, for example $filter=rowDefinition eq ''I/S'' and dateFilter ge 2026-01-01 and dateFilter le 2026-12-31.';

    trigger OnAfterGetRecord()
    var
        AccScheduleLine: Record "Acc. Schedule Line";
        DateFilterText: Text;
    begin
        DateFilterText := Rec.GetFilter("Date Filter");
        if DateFilterText = '' then
            Error(DateFilterRequiredErr);
        PrepareColumns();

        AccScheduleLine := Rec;
        AccScheduleLine.SetFilter("Date Filter", DateFilterText);
        NetChange := AccSchedManagement.CalcCell(AccScheduleLine, TempNetChangeColumn, false);
        BalanceAtDate := AccSchedManagement.CalcCell(AccScheduleLine, TempBalanceColumn, false);
    end;

    local procedure PrepareColumns()
    begin
        if ColumnsReady then
            exit;
        AddColumn(TempNetChangeColumn, 10000, 'NETCHANGE', TempNetChangeColumn."Column Type"::"Net Change");
        AddColumn(TempBalanceColumn, 20000, 'BALANCE', TempBalanceColumn."Column Type"::"Balance at Date");
        ColumnsReady := true;
    end;

    local procedure AddColumn(var TempColumnLayout: Record "Column Layout" temporary; LineNo: Integer; ColumnNo: Code[10]; ColumnType: Enum "Column Layout Type")
    begin
        TempColumnLayout.Init();
        TempColumnLayout."Column Layout Name" := 'BOOKIE';
        TempColumnLayout."Line No." := LineNo;
        TempColumnLayout."Column No." := ColumnNo;
        TempColumnLayout."Column Type" := ColumnType;
        TempColumnLayout."Ledger Entry Type" := TempColumnLayout."Ledger Entry Type"::Entries;
        TempColumnLayout."Amount Type" := TempColumnLayout."Amount Type"::"Net Amount";
        TempColumnLayout.Show := TempColumnLayout.Show::Always;
        TempColumnLayout.Insert();
    end;
}
