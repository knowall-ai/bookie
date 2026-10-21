import type { Opportunity } from '@/lib/domain/types';
import type { OpportunitiesModule } from '../../types';
import { paginate } from '../index';
import { DEMO_TODAY } from '../data';
import { addMonths } from '@/lib/forecast/dates';

/** Fictional Contoso coffee sales, dated relative to today like the other demo fixtures. */
export function demoOpportunities(): OpportunitiesModule {
  return {
    async list(options) {
      const descriptions = [
        'Fabrikam office coffee',
        'Northwind cafe supply',
        'Contoso events',
        'Fabrikam seasonal blends',
        'Northwind training',
        'Contoso equipment',
        'Fabrikam completed order',
        'Northwind cancelled order',
      ];
      const items: Opportunity[] = descriptions.map((description, i) => ({
        id: `opportunity-${i + 1}`,
        number: `OPP-${1001 + i}`,
        description,
        contact: i % 2 ? 'Northwind' : 'Fabrikam',
        status: i === 6 ? 'won' : i === 7 ? 'lost' : i % 2 ? 'not-started' : 'in-progress',
        closed: i >= 6,
        estimatedValue: i === 5 ? undefined : 2000 + i * 1500,
        chanceOfSuccess: [90, 70, 50, 30, 10, 60, 100, 0][i],
        estimatedClosingDate: i === 4 ? undefined : addMonths(DEMO_TODAY(), i % 6),
        currency: 'GBP',
      }));
      return paginate(
        items.filter((item) => !options?.open || !item.closed),
        options
      );
    },
  };
}
