import { describe, expect, it, vi } from 'vitest';
import { bcOpportunities, fromBcOpportunity, type BcOpportunity } from './opportunities';
import type { BcClient } from '../client';

const raw: BcOpportunity = {
  id: 'opportunity-contoso',
  number: 'OPP-1001',
  description: 'Contoso coffee supply',
  contactCompanyName: 'Fabrikam',
  contactName: 'Contoso buyer',
  status: 'In_x0020_Progress',
  closed: false,
  estimatedValue: 1234.56,
  chancesOfSuccessPrc: 70,
  estimatedClosingDate: '2026-11-20',
};

describe('BC opportunities', () => {
  it('maps LCY values and company contact without inventing fields', () => {
    expect(fromBcOpportunity(raw, 'GBP')).toMatchObject({
      contact: 'Fabrikam',
      status: 'in-progress',
      currency: 'GBP',
      estimatedValue: 1234.56,
      chanceOfSuccess: 70,
      estimatedClosingDate: '2026-11-20',
    });
    expect(fromBcOpportunity({ ...raw, contactCompanyName: '' }, '').contact).toBe('Contoso buyer');
    expect(fromBcOpportunity(raw, '').currency).toBeUndefined();
  });

  it.each([
    ['Not_x0020_Started', 'not-started'],
    ['Not Started', 'not-started'],
    ['In Progress', 'in-progress'],
    ['Won', 'won'],
    ['Lost', 'lost'],
    ['Unexpected', 'unknown'],
    ['toString', 'unknown'],
  ])('decodes %s', (status, expected) => {
    expect(fromBcOpportunity({ ...raw, status }, 'GBP').status).toBe(expected);
  });

  it('keeps missing dates and missing or non-finite numbers undefined', () => {
    for (const value of [undefined, NaN, Infinity]) {
      const mapped = fromBcOpportunity(
        {
          ...raw,
          estimatedValue: value,
          chancesOfSuccessPrc: value,
          estimatedClosingDate: '0001-01-01',
        },
        'GBP'
      );
      expect(mapped.estimatedValue).toBeUndefined();
      expect(mapped.chanceOfSuccess).toBeUndefined();
      expect(mapped.estimatedClosingDate).toBeUndefined();
    }
    expect(
      fromBcOpportunity({ ...raw, estimatedValue: 0, chancesOfSuccessPrc: 0 }, 'GBP')
    ).toMatchObject({ estimatedValue: 0, chanceOfSuccess: 0 });
    expect(
      fromBcOpportunity({ ...raw, chancesOfSuccessPrc: 101 }, 'GBP').chanceOfSuccess
    ).toBeUndefined();
  });

  it('filters open rows and uses an extra row to detect another page', async () => {
    const request = vi.fn().mockResolvedValue({ value: [raw, raw, raw] });
    const opportunities = bcOpportunities({ request } as unknown as BcClient, async () => 'GBP');
    const result = await opportunities.list({ open: true, page: 2, pageSize: 2 });
    expect(request).toHaveBeenCalledWith('opportunities', {
      query: {
        $filter: 'closed eq false',
        $orderby: 'number,id',
        $top: 3,
        $skip: 2,
      },
    });
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });
});
