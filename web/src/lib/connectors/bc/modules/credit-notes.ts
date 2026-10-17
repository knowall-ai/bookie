import type { BcClient } from '../client';
import type { CreditNotesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function bcCreditNotes(client: BcClient, lcy: () => Promise<string>): CreditNotesModule | undefined {
  void client;
  return undefined;
}
