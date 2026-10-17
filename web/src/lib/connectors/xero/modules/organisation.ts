import type { OrgDetails, OrgUser, PaymentTerm } from '@/lib/domain/types';
import { xeroDate, xeroTimestamp, type XeroClient } from '../client';
import type { UsersModule } from '../../types';

/** GET Organisation, trimmed to what Bookie shows. */
export interface XeroOrganisation {
  Name: string;
  LegalName?: string;
  CountryCode?: string;
  BaseCurrency: string;
  TaxNumber?: string;
  RegistrationNumber?: string;
  FinancialYearEndDay?: number;
  FinancialYearEndMonth?: number;
  Timezone?: string;
  ShortCode?: string;
  OrganisationType?: string;
  LineOfBusiness?: string;
  Class?: string;
  Edition?: string;
  PaysTax?: boolean;
  SalesTaxBasis?: string;
  SalesTaxPeriod?: string;
  DefaultSalesTax?: string;
  DefaultPurchasesTax?: string;
  PeriodLockDate?: string;
  EndOfYearLockDate?: string;
  CreatedDateUTC?: string;
  OrganisationStatus?: string;
  IsDemoCompany?: boolean;
  Phones?: {
    PhoneType?: string;
    PhoneNumber?: string;
    PhoneAreaCode?: string;
    PhoneCountryCode?: string;
  }[];
  PaymentTerms?: {
    Bills?: { Day?: number; Type?: string };
    Sales?: { Day?: number; Type?: string };
  };
  Addresses?: {
    AddressType?: string;
    AddressLine1?: string;
    AddressLine2?: string;
    City?: string;
    Region?: string;
    PostalCode?: string;
    Country?: string;
  }[];
}

const term = (raw?: { Day?: number; Type?: string }): PaymentTerm | undefined =>
  raw?.Day !== undefined && raw.Type ? { day: raw.Day, type: raw.Type } : undefined;

export function fromXeroOrganisation(
  o: XeroOrganisation,
  sourceUrl: string | undefined
): OrgDetails {
  const a = o.Addresses?.find((x) => x.AddressLine1) ?? o.Addresses?.[0];
  const p = o.Phones?.find((x) => x.PhoneNumber);
  const sales = term(o.PaymentTerms?.Sales);
  const bills = term(o.PaymentTerms?.Bills);
  return {
    name: o.Name,
    legalName: o.LegalName,
    country: o.CountryCode,
    baseCurrency: o.BaseCurrency,
    taxNumber: o.TaxNumber,
    registrationNumber: o.RegistrationNumber,
    financialYearEndDay: o.FinancialYearEndDay,
    financialYearEndMonth: o.FinancialYearEndMonth,
    timezone: o.Timezone,
    address: a
      ? {
          line1: a.AddressLine1,
          line2: a.AddressLine2,
          city: a.City,
          region: a.Region,
          postalCode: a.PostalCode,
          country: a.Country,
        }
      : undefined,
    sourceUrl,
    organisationType: o.OrganisationType || undefined,
    lineOfBusiness: o.LineOfBusiness || undefined,
    plan: o.Class || undefined,
    edition: o.Edition || undefined,
    phone: p
      ? [p.PhoneCountryCode && `+${p.PhoneCountryCode}`, p.PhoneAreaCode, p.PhoneNumber]
          .filter(Boolean)
          .join(' ')
      : undefined,
    paysTax: o.PaysTax,
    salesTaxBasis: o.SalesTaxBasis || undefined,
    salesTaxPeriod: o.SalesTaxPeriod || undefined,
    defaultSalesTax: o.DefaultSalesTax || undefined,
    defaultPurchasesTax: o.DefaultPurchasesTax || undefined,
    periodLockDate: xeroDate(o.PeriodLockDate),
    endOfYearLockDate: xeroDate(o.EndOfYearLockDate),
    createdAt: xeroTimestamp(o.CreatedDateUTC),
    status: o.OrganisationStatus || undefined,
    isDemoCompany: o.IsDemoCompany,
    paymentTerms: sales || bills ? { sales, bills } : undefined,
  };
}

/** GET Users. */
export interface XeroUser {
  UserID: string;
  EmailAddress?: string;
  FirstName?: string;
  LastName?: string;
  UpdatedDateUTC?: string;
  IsSubscriber?: boolean;
  OrganisationRole?: string;
}

export function fromXeroUser(raw: XeroUser): OrgUser {
  return {
    id: raw.UserID,
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    email: raw.EmailAddress || undefined,
    role: raw.OrganisationRole || undefined,
    isSubscriber: raw.IsSubscriber,
    updatedAt: xeroTimestamp(raw.UpdatedDateUTC),
  };
}

export function xeroUsers(client: XeroClient): UsersModule {
  return {
    async list() {
      const result = await client.request<{ Users?: XeroUser[] }>('Users');
      return (result.Users ?? [])
        .filter((u) => u.OrganisationRole !== 'REMOVED')
        .map(fromXeroUser)
        .sort((a, b) =>
          `${a.firstName ?? ''} ${a.lastName ?? ''}`.localeCompare(
            `${b.firstName ?? ''} ${b.lastName ?? ''}`
          )
        );
    },
  };
}
