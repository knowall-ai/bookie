import type { AccountingConnector } from '@/lib/connectors/types';

export type ModuleName =
  | 'invoices'
  | 'quotes'
  | 'creditNotes'
  | 'purchaseOrders'
  | 'contacts'
  | 'items'
  | 'payments'
  | 'bank'
  | 'accounts'
  | 'journals'
  | 'taxRates'
  | 'assets'
  | 'reports'
  | 'payroll'
  | 'projects';

export type ModuleAvailability = Record<ModuleName, boolean>;

const MODULES: ModuleName[] = [
  'invoices',
  'quotes',
  'creditNotes',
  'purchaseOrders',
  'contacts',
  'items',
  'payments',
  'bank',
  'accounts',
  'journals',
  'taxRates',
  'assets',
  'reports',
  'payroll',
  'projects',
];

export function moduleAvailability(connector: AccountingConnector): ModuleAvailability {
  return Object.fromEntries(MODULES.map((m) => [m, !!connector[m]])) as ModuleAvailability;
}

export interface NavItem {
  label: string;
  /** Relative to `/portal/{org}`. */
  href: string;
  module?: ModuleName;
}

export interface NavTab {
  key: string;
  label: string;
  /** Tabs without items link straight to `href`. */
  href: string;
  items?: NavItem[];
  /** Extra path prefixes that mark this tab active. */
  match?: string[];
}

/** The top tabs, in Xero's order. */
export const NAV: NavTab[] = [
  { key: 'home', label: 'Home', href: '' },
  {
    key: 'sales',
    label: 'Sales',
    href: '/sales',
    items: [
      { label: 'Sales overview', href: '/sales', module: 'invoices' },
      { label: 'Invoices', href: '/sales/invoices', module: 'invoices' },
      { label: 'Quotes', href: '/sales/quotes', module: 'quotes' },
      { label: 'Credit notes', href: '/sales/credit-notes', module: 'creditNotes' },
      { label: 'Products and services', href: '/sales/products', module: 'items' },
      { label: 'Customers', href: '/contacts?role=customer', module: 'contacts' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    href: '/purchases',
    items: [
      { label: 'Purchases overview', href: '/purchases', module: 'invoices' },
      { label: 'Bills', href: '/purchases/bills', module: 'invoices' },
      { label: 'Purchase orders', href: '/purchases/orders', module: 'purchaseOrders' },
      { label: 'Supplier credit notes', href: '/purchases/credit-notes', module: 'creditNotes' },
      { label: 'Suppliers', href: '/contacts?role=supplier', module: 'contacts' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    href: '/reporting',
    items: [
      { label: 'All reports', href: '/reporting', module: 'reports' },
      { label: 'Profit and loss', href: '/reporting/profit-and-loss', module: 'reports' },
      { label: 'Balance sheet', href: '/reporting/balance-sheet', module: 'reports' },
      { label: 'Aged receivables', href: '/reporting/aged-receivables', module: 'reports' },
      { label: 'Aged payables', href: '/reporting/aged-payables', module: 'reports' },
      { label: 'Trial balance', href: '/reporting/trial-balance', module: 'reports' },
      { label: 'Bank summary', href: '/reporting/bank-summary', module: 'reports' },
      { label: 'Account transactions', href: '/reporting/account-transactions', module: 'reports' },
      { label: 'Journal report', href: '/reporting/journal-report', module: 'reports' },
    ],
  },
  {
    key: 'accounting',
    label: 'Accounting',
    href: '/accounting',
    items: [
      { label: 'Bank accounts', href: '/accounting/bank', module: 'bank' },
      { label: 'Chart of accounts', href: '/accounting/chart', module: 'accounts' },
      { label: 'Manual journals', href: '/accounting/journals', module: 'journals' },
      { label: 'Payments', href: '/accounting/payments', module: 'payments' },
      { label: 'Fixed assets', href: '/accounting/assets', module: 'assets' },
      { label: 'Tax rates', href: '/accounting/tax-rates', module: 'taxRates' },
    ],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    href: '/payroll',
    items: [
      { label: 'Employees', href: '/payroll/employees', module: 'payroll' },
      { label: 'Pay runs', href: '/payroll/pay-runs', module: 'payroll' },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    href: '/projects',
    items: [{ label: 'All projects', href: '/projects', module: 'projects' }],
  },
  {
    key: 'contacts',
    label: 'Contacts',
    href: '/contacts',
    items: [
      { label: 'All contacts', href: '/contacts', module: 'contacts' },
      { label: 'Customers', href: '/contacts?role=customer', module: 'contacts' },
      { label: 'Suppliers', href: '/contacts?role=supplier', module: 'contacts' },
    ],
  },
];

/** "+ New" menu. */
export const CREATE_ITEMS: NavItem[] = [
  { label: 'Invoice', href: '/sales/invoices/new', module: 'invoices' },
  { label: 'Bill', href: '/purchases/bills/new', module: 'invoices' },
  { label: 'Quote', href: '/sales/quotes/new', module: 'quotes' },
  { label: 'Purchase order', href: '/purchases/orders/new', module: 'purchaseOrders' },
  { label: 'Contact', href: '/contacts/new', module: 'contacts' },
  { label: 'Manual journal', href: '/accounting/journals/new', module: 'journals' },
  { label: 'Spend or receive money', href: '/accounting/bank/new', module: 'bank' },
];
