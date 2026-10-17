import type { ManualJournalInput } from '@/lib/domain/types';

/** A reversal: the same lines with debits and credits swapped. Server-safe (no client code). */
export function reverseJournalLines(
  lines: ManualJournalInput['lines']
): ManualJournalInput['lines'] {
  return lines.map((l) => ({ ...l, amount: -l.amount }));
}
