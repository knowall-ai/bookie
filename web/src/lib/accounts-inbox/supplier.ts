import type { ContactInput } from '@/lib/domain/types';
import type { SupplierEvidence } from './match';

/**
 * The new supplier contact proposed from an emailed invoice: what the document prints
 * (the sender's address when it prints no email). Email and phone require verified
 * mail. Never its bank details: those are
 * checked with the supplier by phone and entered by a person.
 */
export function newSupplierInput(
  evidence: SupplierEvidence,
  trust: string
): ContactInput | undefined {
  const name = evidence.name?.value?.trim();
  if (!name) return undefined;
  const a = evidence.address?.value;
  const address =
    a && Object.values(a).some(Boolean)
      ? {
          line1: a.line1 ?? undefined,
          line2: a.line2 ?? undefined,
          city: a.city ?? undefined,
          region: a.region ?? undefined,
          postalCode: a.postalCode ?? undefined,
          country: a.country ?? undefined,
        }
      : undefined;
  return {
    name: name.slice(0, 255),
    ...(trust === 'trusted'
      ? {
          email: (evidence.email?.value ?? evidence.senderAddress?.value)?.slice(0, 255),
          phone: evidence.phone?.value?.slice(0, 50),
        }
      : {}),
    taxNumber: evidence.taxNumber?.value?.slice(0, 50),
    address,
    isSupplier: true,
    isCustomer: false,
  };
}
