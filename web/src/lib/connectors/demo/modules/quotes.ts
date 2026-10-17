import type { DemoData } from '../data';
import type { QuotesModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoQuotes(data: DemoData): QuotesModule | undefined {
  void data;
  return undefined;
}
