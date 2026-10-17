import type { OrgUser } from '@/lib/domain/types';
import type { UsersModule } from '../../types';

/** Fictional people with access to the demo books (example.com addresses only). */
const DEMO_USERS: OrgUser[] = [
  {
    id: 'user-1',
    firstName: 'Alex',
    lastName: 'Morgan',
    email: 'alex.morgan@contoso.example.com',
    role: 'FINANCIALADVISER',
    isSubscriber: true,
    updatedAt: '2026-04-02T09:15:00.000Z',
  },
  {
    id: 'user-2',
    firstName: 'Priya',
    lastName: 'Shah',
    email: 'priya.shah@contoso.example.com',
    role: 'STANDARD',
    isSubscriber: false,
    updatedAt: '2026-06-11T14:02:00.000Z',
  },
  {
    id: 'user-3',
    firstName: 'Sam',
    lastName: 'Okafor',
    email: 'sam@fabrikam-accountants.example.com',
    role: 'FINANCIALADVISER',
    isSubscriber: false,
    updatedAt: '2026-01-20T10:30:00.000Z',
  },
  {
    id: 'user-4',
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'jordan.lee@contoso.example.com',
    role: 'INVOICEONLY',
    isSubscriber: false,
    updatedAt: '2026-08-05T08:45:00.000Z',
  },
  {
    id: 'user-5',
    firstName: 'Casey',
    lastName: 'Walsh',
    email: 'casey.walsh@contoso.example.com',
    role: 'READONLY',
    isSubscriber: false,
    updatedAt: '2026-09-28T16:20:00.000Z',
  },
];

export function demoUsers(): UsersModule {
  return {
    async list() {
      return structuredClone(DEMO_USERS).sort((a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      );
    },
  };
}
