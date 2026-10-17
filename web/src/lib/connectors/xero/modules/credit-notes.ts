import type { XeroClient } from '../client';
import type { CreditNotesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function xeroCreditNotes(client: XeroClient): CreditNotesModule | undefined {
  void client;
  return undefined;
}
