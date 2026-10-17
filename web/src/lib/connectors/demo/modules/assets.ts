import type { DemoData } from '../data';
import type { AssetsModule } from '../../types';

/** TODO(bookie): implement. Returning undefined hides this module in the UI. */
export function demoAssets(data: DemoData): AssetsModule | undefined {
  void data;
  return undefined;
}
