import type { FixedAsset } from '@/lib/domain/types';
import type { XeroClient } from '../client';
import type { AssetsModule } from '../../types';

/** Xero Assets API (assets.xro/1.0) item. */
export interface XeroAsset {
  assetId: string;
  assetName: string;
  assetNumber?: string;
  assetStatus?: 'Draft' | 'Registered' | 'Disposed';
  purchaseDate?: string;
  purchasePrice?: number;
  disposalPrice?: number;
  accountingBookValue?: number;
}

const STATUS: Record<NonNullable<XeroAsset['assetStatus']>, FixedAsset['status']> = {
  Draft: 'draft',
  Registered: 'registered',
  Disposed: 'disposed',
};

/** Xero's asset list doesn't include the asset type, so `assetType` stays unset. */
export function fromXeroAsset(raw: XeroAsset): FixedAsset {
  return {
    id: raw.assetId,
    number: raw.assetNumber ?? '',
    name: raw.assetName,
    // An asset status Xero didn't send (or a new one) is unknown, not draft.
    status: (raw.assetStatus && STATUS[raw.assetStatus]) ?? 'unknown',
    purchaseDate: raw.purchaseDate?.slice(0, 10) || undefined,
    purchasePrice: raw.purchasePrice,
    bookValue: raw.accountingBookValue,
  };
}

export function xeroAssets(client: XeroClient): AssetsModule {
  return {
    async list(query) {
      const page = query?.page ?? 1;
      const pageSize = query?.pageSize ?? 50;
      const status = (query?.status ?? 'registered').toUpperCase();
      const result = await client.request<{
        pagination?: { itemCount?: number };
        items?: XeroAsset[];
      }>('Assets', {
        api: 'assets',
        query: {
          status,
          page,
          pageSize,
          orderBy: 'AssetNumber',
          sortDirection: 'DESC',
          filterBy: query?.search || undefined,
        },
      });
      const total = result.pagination?.itemCount;
      return {
        items: (result.items ?? []).map(fromXeroAsset),
        page,
        pageSize,
        hasMore: total !== undefined ? total > page * pageSize : false,
        total,
      };
    },
  };
}
