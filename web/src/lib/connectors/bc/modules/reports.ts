import type { BcClient } from '../client';
import type { ReportsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcReports(client: BcClient, lcy: () => Promise<string>): ReportsModule | undefined {
  void client;
  return undefined;
}
