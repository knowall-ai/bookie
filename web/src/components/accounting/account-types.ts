/**
 * Account types offered by "New account", grouped and labelled as Xero's own
 * form does. Only sources whose accounts module supports `create` show it.
 */
export const ACCOUNT_TYPE_GROUPS: { group: string; types: { value: string; label: string }[] }[] = [
  {
    group: 'Assets',
    types: [
      { value: 'CURRENT', label: 'Current Asset' },
      { value: 'FIXED', label: 'Fixed Asset' },
      { value: 'INVENTORY', label: 'Inventory' },
      { value: 'NONCURRENT', label: 'Non-current Asset' },
      { value: 'PREPAYMENT', label: 'Prepayment' },
    ],
  },
  {
    group: 'Equity',
    types: [{ value: 'EQUITY', label: 'Equity' }],
  },
  {
    group: 'Expenses',
    types: [
      { value: 'DEPRECIATN', label: 'Depreciation' },
      { value: 'DIRECTCOSTS', label: 'Direct Costs' },
      { value: 'EXPENSE', label: 'Expense' },
      { value: 'OVERHEADS', label: 'Overhead' },
    ],
  },
  {
    group: 'Liabilities',
    types: [
      { value: 'CURRLIAB', label: 'Current Liability' },
      { value: 'LIABILITY', label: 'Liability' },
      { value: 'TERMLIAB', label: 'Non-current Liability' },
    ],
  },
  {
    group: 'Revenue',
    types: [
      { value: 'OTHERINCOME', label: 'Other Income' },
      { value: 'REVENUE', label: 'Revenue' },
      { value: 'SALES', label: 'Sales' },
    ],
  },
];
