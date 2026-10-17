import type { Project } from '@/lib/domain/types';
import type { DemoData } from '../data';
import { matches, notFound, paginate } from '../index';
import type { ProjectsModule } from '../../types';

/** Five fictional projects for Contoso's customers. */
const PROJECTS: (Omit<Project, 'contact'> & { customer: string })[] = [
  {
    id: 'proj-1',
    name: 'Hotel breakfast blend rollout',
    customer: 'Fabrikam Hotels',
    status: 'in-progress',
    deadline: '2026-12-18',
    currency: 'GBP',
    estimate: 18_000,
    totalInvoiced: 7_200,
    totalToInvoice: 2_400,
    totalExpenses: 640,
    minutesLogged: 3_120,
  },
  {
    id: 'proj-2',
    name: 'Cafe fit-out coffee training',
    customer: 'Litware Cafe',
    status: 'in-progress',
    deadline: '2027-01-29',
    currency: 'GBP',
    estimate: 6_500,
    totalInvoiced: 1_950,
    totalToInvoice: 0,
    totalExpenses: 120,
    minutesLogged: 780,
  },
  {
    id: 'proj-3',
    name: 'Own-label packaging design',
    customer: 'Woodgrove Bakery',
    status: 'in-progress',
    currency: 'GBP',
    estimate: 4_200,
    totalInvoiced: 4_200,
    totalToInvoice: 350,
    totalExpenses: 910,
    minutesLogged: 1_260,
  },
  {
    id: 'proj-4',
    name: 'Office coffee subscription pilot',
    customer: 'Proseware Offices',
    status: 'closed',
    deadline: '2026-06-30',
    currency: 'GBP',
    estimate: 9_000,
    totalInvoiced: 8_850,
    totalToInvoice: 0,
    totalExpenses: 1_025,
    minutesLogged: 2_940,
  },
  {
    id: 'proj-5',
    name: 'Tasting event for new single-origin',
    customer: 'Northwind Traders',
    status: 'closed',
    deadline: '2026-03-14',
    currency: 'GBP',
    estimate: 3_000,
    totalInvoiced: 3_000,
    totalToInvoice: 0,
    totalExpenses: 460,
    minutesLogged: 690,
  },
];

export function demoProjects(data: DemoData): ProjectsModule | undefined {
  const build = (p: (typeof PROJECTS)[number]): Project => {
    const { customer, ...rest } = p;
    const contact = data.contacts.find((c) => c.name === customer);
    return { ...rest, contact: contact ? { id: contact.id, name: contact.name } : undefined };
  };
  return {
    async list(query) {
      const wanted = query?.status ?? 'in-progress';
      const rows = PROJECTS.map(build).filter(
        (p) => p.status === wanted && matches([p.name, p.contact?.name], query?.search)
      );
      return paginate(rows, query);
    },
    async get(id) {
      const found = PROJECTS.find((p) => p.id === id);
      return found ? build(found) : notFound('Project');
    },
  };
}
