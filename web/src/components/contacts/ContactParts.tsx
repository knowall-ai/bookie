import type { Address, Contact } from '@/lib/domain/types';
import { Badge } from '@/components/ui/Badge';

/** "Customer", "Supplier" and "Archived" pills, as on Xero's contact page. */
export function RoleBadges({ contact }: { contact: Contact }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {contact.isCustomer && <Badge tone="blue">Customer</Badge>}
      {contact.isSupplier && <Badge tone="violet">Supplier</Badge>}
      {contact.status === 'archived' && <Badge>Archived</Badge>}
    </span>
  );
}

/** Address lines for display, skipping blanks. */
export function addressLines(address?: Address): string[] {
  if (!address) return [];
  const cityLine = [address.city, address.region, address.postalCode].filter(Boolean).join(', ');
  return [address.line1, address.line2, cityLine, address.country].filter(
    (l): l is string => !!l && l.trim() !== ''
  );
}

/** Initials for the contact avatar: "Contoso Coffee" → "CC". */
export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2))
    .toUpperCase()
    .slice(0, 2);
}

export function ContactAvatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={
        size === 'lg'
          ? 'bg-brand/15 text-brand-bright flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold'
          : 'bg-surface-3 text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold'
      }
    >
      {initials(name)}
    </span>
  );
}
