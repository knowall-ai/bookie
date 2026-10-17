import type { DemoData } from '../data';
import type { ItemsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoItems(data: DemoData): ItemsModule | undefined {
  void data;
  return undefined;
}
