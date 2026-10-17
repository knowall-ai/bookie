import type { XeroClient } from '../client';
import type { ReportsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroReports(client: XeroClient): ReportsModule | undefined {
  void client;
  return undefined;
}
