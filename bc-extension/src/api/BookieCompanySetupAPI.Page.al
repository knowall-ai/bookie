namespace KnowAll.Bookie;

using Microsoft.Finance.GeneralLedger.Setup;
using Microsoft.Foundation.Company;
using Microsoft.Foundation.Period;

/// <summary>
/// The company settings Bookie needs and API v2.0 doesn't give reliably: the local
/// currency code (companyInformation.currencyCode is blank when it is the LCY), the
/// fiscal year from the accounting periods, the country and VAT registration, and the
/// financial reports General Ledger Setup uses. One row.
///
/// Bookie also calls this to detect the extension: a 404 means it isn't installed.
///
/// Endpoint: /api/knowallBookie/bookie/v1.0/companies({companyId})/companySetup
/// </summary>
page 50208 "Bookie Company Setup API"
{
    APIPublisher = 'knowallBookie';
    APIGroup = 'bookie';
    APIVersion = 'v1.0';
    EntityName = 'companySetup';
    EntitySetName = 'companySetup';
    EntityCaption = 'Company Setup';
    EntitySetCaption = 'Company Setup';
    PageType = API;
    SourceTable = "General Ledger Setup";
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
                field(lcyCode; Rec."LCY Code")
                {
                    Caption = 'LCY Code';
                }
                field(localCurrencySymbol; Rec."Local Currency Symbol")
                {
                    Caption = 'Local Currency Symbol';
                }
                field(localCurrencyDescription; Rec."Local Currency Description")
                {
                    Caption = 'Local Currency Description';
                }
                field(additionalReportingCurrency; Rec."Additional Reporting Currency")
                {
                    Caption = 'Additional Reporting Currency';
                }
                field(amountRoundingPrecision; Rec."Amount Rounding Precision")
                {
                    Caption = 'Amount Rounding Precision';
                }
                field(allowPostingFrom; Rec."Allow Posting From")
                {
                    Caption = 'Allow Posting From';
                }
                field(allowPostingTo; Rec."Allow Posting To")
                {
                    Caption = 'Allow Posting To';
                }
                // Start of the fiscal year today falls in, from the Accounting Periods. Blank when
                // the company has no accounting periods.
                field(fiscalYearStartDate; FiscalYearStart)
                {
                    Caption = 'Fiscal Year Start Date';
                }
                // Day before the next fiscal year starts. Blank when the next year isn't set up yet.
                field(fiscalYearEndDate; FiscalYearEnd)
                {
                    Caption = 'Fiscal Year End Date';
                }
                field(incomeStatementReport; Rec."Fin. Rep. for Income Stmt.")
                {
                    Caption = 'Financial Report for Income Statement';
                }
                field(balanceSheetReport; Rec."Fin. Rep. for Balance Sheet")
                {
                    Caption = 'Financial Report for Balance Sheet';
                }
                field(cashFlowReport; Rec."Fin. Rep. for Cash Flow Stmt")
                {
                    Caption = 'Financial Report for Cash Flow Statement';
                }
                field(retainedEarningsReport; Rec."Fin. Rep. for Retained Earn.")
                {
                    Caption = 'Financial Report for Retained Earnings';
                }
                field(countryRegionCode; CountryRegionCode)
                {
                    Caption = 'Country/Region Code';
                }
                field(vatRegistrationNumber; VATRegistrationNo)
                {
                    Caption = 'VAT Registration No.';
                }
                field(registrationNumber; RegistrationNo)
                {
                    Caption = 'Registration No.';
                }
                field(extensionVersion; ExtensionVersion)
                {
                    Caption = 'Extension Version';
                }
            }
        }
    }

    var
        FiscalYearStart: Date;
        FiscalYearEnd: Date;
        CountryRegionCode: Code[10];
        VATRegistrationNo: Text[20];
        RegistrationNo: Text[20];
        ExtensionVersion: Text[30];

    trigger OnAfterGetRecord()
    var
        AccountingPeriod: Record "Accounting Period";
        CompanyInformation: Record "Company Information";
        ModuleInfo: ModuleInfo;
    begin
        FiscalYearStart := 0D;
        FiscalYearEnd := 0D;
        AccountingPeriod.SetRange("New Fiscal Year", true);
        AccountingPeriod.SetFilter("Starting Date", '..%1', Today());
        if AccountingPeriod.FindLast() then begin
            FiscalYearStart := AccountingPeriod."Starting Date";
            AccountingPeriod.SetFilter("Starting Date", '>%1', FiscalYearStart);
            if AccountingPeriod.FindFirst() then
                FiscalYearEnd := AccountingPeriod."Starting Date" - 1;
        end;

        if CompanyInformation.Get() then begin
            CountryRegionCode := CompanyInformation."Country/Region Code";
            VATRegistrationNo := CompanyInformation."VAT Registration No.";
            RegistrationNo := CompanyInformation."Registration No.";
        end;

        NavApp.GetCurrentModuleInfo(ModuleInfo);
        ExtensionVersion := Format(ModuleInfo.AppVersion());
    end;
}
