import { Users } from 'lucide-react';
import { isConnectorError } from '@/lib/connectors/types';
import { EmptyState } from '@/components/ui/States';

/**
 * Xero answers 400/401/403/404 from the Payroll API when the organisation does
 * not use (UK) payroll. That is a normal state for most orgs, not a failure.
 * Errors from other back ends are real errors.
 */
export function isPayrollNotSetUp(error: unknown, kind: string): boolean {
  return kind === 'xero' && isConnectorError(error) && [400, 401, 403, 404].includes(error.status);
}

export function PayrollNotSetUp({ source }: { source: string }) {
  return (
    <EmptyState
      icon={<Users className="h-6 w-6" />}
      title={`Payroll isn't set up in ${source} for this organisation`}
      body={`${source} has no payroll data to show. Set up payroll in ${source} (UK payroll only) and it will appear here.`}
    />
  );
}
