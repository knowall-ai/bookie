import { z } from 'zod';
import type { ContactInput } from '@/lib/domain/types';

const text = (max: number) => z.string().trim().max(max).optional();

export const contactSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a contact name.').max(255, 'The name is too long.'),
    firstName: text(255),
    lastName: text(255),
    email: z
      .string()
      .trim()
      .max(255)
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address.')
      .optional(),
    phone: text(50),
    website: z
      .string()
      .trim()
      .max(255)
      .refine(
        (v) => v === '' || /^(https?:\/\/)?[^\s.]+(\.[^\s.]+)+(\/\S*)?$/i.test(v),
        'Enter a valid website address.'
      )
      .optional(),
    accountNumber: text(50),
    taxNumber: text(50),
    address: z
      .object({
        line1: text(500),
        line2: text(500),
        city: text(255),
        region: text(255),
        postalCode: text(50),
        country: text(50),
      })
      .optional(),
    isCustomer: z.boolean().optional(),
    isSupplier: z.boolean().optional(),
  })
  .strict();

/**
 * Validate a contact form. Blank fields are dropped when creating, but kept as
 * `''` when updating so that clearing a field in the form clears it in the books.
 */
export function parseContactInput(input: unknown, mode: 'create' | 'update'): ContactInput {
  const parsed = contactSchema.parse(input);
  const blank = (v: string | undefined) => (mode === 'create' && v === '' ? undefined : v);
  const address = parsed.address
    ? Object.fromEntries(Object.entries(parsed.address).map(([k, v]) => [k, blank(v)]))
    : undefined;
  const hasAddress = !!address && Object.values(address).some((v) => v);
  return {
    name: parsed.name,
    firstName: blank(parsed.firstName),
    lastName: blank(parsed.lastName),
    email: blank(parsed.email),
    phone: blank(parsed.phone),
    website: blank(
      parsed.website && !/^https?:\/\//i.test(parsed.website)
        ? `https://${parsed.website}`
        : parsed.website
    ),
    accountNumber: blank(parsed.accountNumber),
    taxNumber: blank(parsed.taxNumber),
    address: mode === 'update' ? address : hasAddress ? address : undefined,
    isCustomer: parsed.isCustomer,
    isSupplier: parsed.isSupplier,
  };
}
