import type { DemoData } from '../data';
import type { CreditNotesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoCreditNotes(data: DemoData): CreditNotesModule | undefined {
  void data;
  return undefined;
}
