/** Labels for the org Settings page, in Xero's words. Unknown codes are humanised, never guessed. */
import type { PaymentTerm } from '@/lib/domain/types';

/** `FINANCIALADVISER` → `Financialadviser`; `SOLE_TRADER` → `Sole trader`. */
export function humanise(code: string): string {
  const text = code.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Xero user roles (`User.OrganisationRole`). */
export const ROLE_LABELS: Record<string, string> = {
  READONLY: 'Read only',
  INVOICEONLY: 'Invoice only',
  STANDARD: 'Standard',
  FINANCIALADVISER: 'Adviser',
  MANAGEDCLIENT: 'Managed client',
  CASHBOOKCLIENT: 'Cashbook client',
  UNKNOWN: 'Unknown',
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function financialYearEndLabel(day?: number, month?: number): string | undefined {
  if (!day || !month || month < 1 || month > 12) return undefined;
  return `${day} ${MONTHS[month - 1]}`;
}

const TERM_RULES: Record<string, (day: number, doc: string) => string> = {
  DAYSAFTERBILLDATE: (d, doc) => `${d} day${d === 1 ? '' : 's'} after the ${doc} date`,
  DAYSAFTERBILLMONTH: (d, doc) => `${d} day${d === 1 ? '' : 's'} after the end of the ${doc} month`,
  OFCURRENTMONTH: (d) => `Day ${d} of the current month`,
  OFFOLLOWINGMONTH: (d) => `Day ${d} of the following month`,
};

export function paymentTermLabel(term: PaymentTerm, doc: 'invoice' | 'bill'): string {
  const rule = TERM_RULES[term.type];
  return rule ? rule(term.day, doc) : `${term.day} (${humanise(term.type)})`;
}

const BASIS: Record<string, string> = {
  CASH: 'Cash basis',
  ACCRUAL: 'Accrual basis',
  ACCRUALS: 'Accrual basis',
  INVOICE: 'Invoice basis',
  PAYMENTS: 'Payments basis',
  FLATRATECASH: 'Flat rate, cash basis',
  FLATRATEACCRUAL: 'Flat rate, accrual basis',
  NONE: 'None',
};

export function salesTaxBasisLabel(code: string): string {
  return BASIS[code] ?? humanise(code);
}

const PERIODS: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  ANNUALLY: 'Annually',
  YEARLY: 'Yearly',
  NONE: 'None',
};

/** Xero also has numbered variants (QUARTERLY1, 2MONTHLY...); those show as their code, humanised. */
export function salesTaxPeriodLabel(code: string): string {
  return PERIODS[code] ?? humanise(code);
}
