/**
 * A next step Bookie recommends, shown as a card with a button the user can action.
 * Built on the server from the live record (see `suggestions.ts`): Bookie picks the
 * step and explains why, but the record, figures, link and action come from the source.
 */
export interface BookieSuggestion {
  /** Stable for the same step on the same record, so a dismissal sticks. */
  id: string;
  title: string;
  reason: string;
  severity: 'info' | 'warning' | 'issue';
  /** The record the step is about, as the source reported it. */
  subject?: SuggestionSubject;
  action: SuggestionAction;
}

export interface SuggestionSubject {
  kind: 'invoice' | 'contact' | 'bank-account';
  label: string;
  href: string;
  contact?: string;
  /** What's left to pay; undefined when the source doesn't report it. */
  amountDue?: number;
  currency?: string;
  dueDate?: string;
  overdue?: boolean;
}

export type SuggestionAction =
  | { kind: 'link'; label: string; href: string }
  | {
      /** Runs `invoiceAction` after the user confirms it. */
      kind: 'invoice';
      action: 'approve' | 'email';
      invoiceId: string;
      label: string;
      confirm: { title: string; body: string; cta: string };
      done: string;
    };
