import type { FixedAsset } from '@/lib/domain/types';
import { odataString, type BcClient, type ODataList } from '../client';
import type { AssetsModule } from '../../types';

export interface BcFixedAsset {
  id: string;
  number: string;
  displayName: string;
  classCode?: string;
  subclassCode?: string;
  blocked?: boolean;
}

export const BC_ASSET_STATUS_NOTE =
  "Business Central's API lists fixed asset cards only. Status, acquisition cost, book value and disposals live in FA depreciation books, which it doesn't expose, so they show as not available.";

/**
 * A BC fixed asset card has no draft/registered/disposed state in the API
 * (that lives in its depreciation book), so the status is `unknown`.
 */
export function fromBcFixedAsset(raw: BcFixedAsset): FixedAsset {
  return {
    id: raw.id,
    number: raw.number,
    name: raw.displayName,
    status: 'unknown',
    purchaseDate: undefined,
    purchasePrice: undefined,
    bookValue: undefined,
    assetType: [raw.classCode, raw.subclassCode].filter(Boolean).join(' · ') || undefined,
  };
}

export function bcAssets(client: BcClient): AssetsModule {
  return {
    statuses: ['unknown'],
    async list(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      if (query?.status && query.status !== 'unknown') {
        return { items: [], page, pageSize, hasMore: false, total: 0, note: BC_ASSET_STATUS_NOTE };
      }
      const search = query?.search ? odataString(query.search) : undefined;
      const result = await client.request<ODataList<BcFixedAsset>>('fixedAssets', {
        query: {
          $filter: search
            ? `(contains(displayName,${search}) or contains(number,${search}))`
            : undefined,
          $orderby: 'number',
          $top: pageSize + 1,
          $skip: (page - 1) * pageSize,
        },
      });
      return {
        items: result.value.slice(0, pageSize).map(fromBcFixedAsset),
        page,
        pageSize,
        hasMore: result.value.length > pageSize,
        note: BC_ASSET_STATUS_NOTE,
      };
    },
  };
}
