import type { FixedAsset } from '@/lib/domain/types';
import { addDays, DEMO_TODAY, type DemoData } from '../data';
import { demoSlot } from './state';
import type { AssetsModule } from '../../types';
import { matches, paginate } from '../index';

/** Fictional fixed asset register for the demo roastery. */
function seedAssets(): FixedAsset[] {
  const today = DEMO_TODAY();
  const asset = (
    n: number,
    name: string,
    assetType: string,
    status: FixedAsset['status'],
    daysAgo: number,
    purchasePrice: number,
    bookValue?: number
  ): FixedAsset => ({
    id: `fa-${n}`,
    number: `FA-${String(n).padStart(4, '0')}`,
    name,
    assetType,
    status,
    purchaseDate: addDays(today, -daysAgo),
    purchasePrice,
    bookValue: status === 'disposed' ? 0 : (bookValue ?? purchasePrice),
  });
  return [
    asset(1, '25kg drum coffee roaster', 'Roasting equipment', 'registered', 160, 42500, 41083.34),
    asset(2, 'Commercial burr grinder', 'Roasting equipment', 'registered', 420, 2850, 2137.5),
    asset(3, 'Two-group espresso machine', 'Cafe equipment', 'registered', 700, 9400, 5483.33),
    asset(4, 'Delivery van', 'Motor vehicles', 'registered', 980, 27600, 14720),
    asset(5, 'Design laptop', 'Computer equipment', 'registered', 300, 1899, 1424.25),
    asset(6, 'Bag sealer and labeller', 'Packaging equipment', 'registered', 540, 3200, 2133.33),
    asset(7, 'Green bean storage racking', 'Fixtures and fittings', 'draft', 6, 1840),
    asset(8, 'Cupping table and scales', 'Cafe equipment', 'draft', 2, 760),
    asset(9, 'Old sample roaster', 'Roasting equipment', 'disposed', 1460, 6200),
    asset(10, 'Office laptop', 'Computer equipment', 'disposed', 1300, 1150),
  ];
}

export function demoAssets(data: DemoData): AssetsModule {
  const assets = () => demoSlot(data, 'assets', seedAssets);
  return {
    async list(query) {
      const status = query?.status ?? 'registered';
      const all = assets()
        .filter(
          (a) => a.status === status && matches([a.name, a.number, a.assetType], query?.search)
        )
        .sort((a, b) => b.number.localeCompare(a.number));
      return paginate(structuredClone(all), query);
    },
  };
}
