/**
 * Bank reconciliation suggestions: which open invoice or bill a bank line
 * probably pays, and why.
 *
 * Pure functions over domain types, with no connector or UI imports, so the
 * portal's Reconcile tab and Bookie the agent can share them.
 *
 * Never guesses: a different currency is never a candidate; an unknown amount
 * due is never treated as zero or as the full total (the candidate can still be
 * shown, from its reference or contact, but can't be paid from here); and a
 * line that already has an unreconciled entry in the books is reported as
 * such, not offered a second payment.
 */
import type { BankTransaction, Invoice, IsoDate } from '@/lib/domain/types';
import { formatMoney } from '@/lib/ui/format';

/** A bank line to explain: a statement line, or one typed in for "Find & match". */
export interface BankLine {
  id: string;
  date: IsoDate;
  direction: 'in' | 'out';
  /** Positive, in the bank account's currency. */
  amount: number;
  /** The line's currency. Undefined when the source doesn't say. */
  currency?: string;
  reference?: string;
  description?: string;
  payee?: string;
}

export interface Suggestion {
  invoice: Invoice;
  /** For ordering only; the UI shows `reasons`, never the number. */
  score: number;
  /** Plain-language reasons, best first: "same amount", "reference has INV-0042"... */
  reasons: string[];
  /** The payment Match would record (the line's amount), or undefined when it can't. */
  payable: boolean;
  /** Why Match isn't offered, when `payable` is false. */
  blocked?: string;
}

export type LineOutcome =
  | {
      kind: 'already-recorded';
      /** The unreconciled entry in the books that this line already is. */
      entry: BankTransaction;
    }
  | { kind: 'suggestions'; suggestions: Suggestion[]; otherCurrency: Invoice[] }
  | { kind: 'no-match'; otherCurrency: Invoice[] }
  | { kind: 'not-comparable'; reason: string };

export interface MatchOptions {
  /** The bank account's currency, used when the line doesn't carry one. */
  accountCurrency?: string;
  /** "Xero", "Business Central": used in "not available from ..." reasons. */
  sourceName: string;
  /** Most suggestions per line (default 5). */
  limit?: number;
}

/** Score weights. Exported for tests; the UI never shows them. */
export const WEIGHTS = {
  exactAmount: 50,
  partPayment: 20,
  number: 40,
  reference: 25,
  contact: 20,
  date: 10,
} as const;

/** The least score worth suggesting: exact amount alone, the number alone, or two weaker clues. */
export const SUGGEST_AT = 40;

/** How far either side of a line date an existing entry may be and still be "this line". */
export const RECORDED_WINDOW_DAYS = 7;

/** Date window: from a few days before the invoice date to this long after its due date. */
const BEFORE_INVOICE_DAYS = 3;
const AFTER_DUE_DAYS = 60;

const EPSILON = 0.005;
const CORPORATE = new Set([
  'ltd',
  'limited',
  'plc',
  'llc',
  'llp',
  'inc',
  'the',
  'and',
  'co',
  'company',
  'group',
  'gmbh',
  'sa',
  'sas',
  'de',
  'cv',
]);

const DAY = 86_400_000;
const days = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Letters and digits only, upper-case: "inv-0042" and "INV 0042" both become "INV0042". */
const compact = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** The first distinctive word of a contact name ("Contoso" for "The Contoso Group Ltd"). */
export function contactKeyword(name: string): string | undefined {
  return words(name).find((w) => w.length >= 3 && !CORPORATE.has(w) && !/^\d+$/.test(w));
}

const sameCurrency = (a?: string, b?: string) =>
  !!a && !!b && a.trim().toUpperCase() === b.trim().toUpperCase();

const lineCurrency = (line: BankLine, options: MatchOptions) =>
  line.currency || options.accountCurrency || undefined;

const documentType = (line: BankLine): Invoice['type'] =>
  line.direction === 'in' ? 'sales' : 'purchase';

/** Where in the line a piece of text appears: its reference first, then description or payee. */
function foundIn(line: BankLine, test: (field: string) => boolean): string | undefined {
  if (line.reference && test(line.reference)) return 'reference';
  if (line.description && test(line.description)) return 'description';
  if (line.payee && test(line.payee)) return 'payee';
  return undefined;
}

const containsCompact = (needle: string) => {
  const n = compact(needle);
  // Very short numbers ("12") would match almost any reference.
  return (field: string) => n.length >= 3 && compact(field).includes(n);
};

const containsWord = (word: string) => (field: string) => words(field).includes(word);

function dateReason(line: BankLine, invoice: Invoice): string | undefined {
  const before = days(invoice.date, line.date);
  if (before < -BEFORE_INVOICE_DAYS) return undefined;
  const anchor = invoice.dueDate ?? invoice.date;
  const label = invoice.dueDate ? 'due date' : 'invoice date';
  const diff = days(anchor, line.date);
  if (diff > AFTER_DUE_DAYS) return undefined;
  if (diff === 0) return `on the ${label}`;
  const n = Math.abs(diff);
  return `${n} ${n === 1 ? 'day' : 'days'} ${diff > 0 ? 'after' : 'before'} ${label}`;
}

/**
 * Score one open invoice or bill against a line. Undefined when it isn't a
 * candidate at all: wrong direction, not awaiting payment, another currency,
 * or the line is more than the amount due.
 */
export function scoreCandidate(
  line: BankLine,
  invoice: Invoice,
  options: MatchOptions
): Suggestion | undefined {
  if (invoice.type !== documentType(line) || invoice.status !== 'authorised') return undefined;
  if (!sameCurrency(lineCurrency(line, options), invoice.currency)) return undefined;
  const currency = invoice.currency;
  const reasons: string[] = [];
  let score = 0;
  let payable = true;
  let blocked: string | undefined;

  if (invoice.amountDue === undefined) {
    payable = false;
    blocked = `The amount due isn't available from ${options.sourceName}, so Bookie can't check the payment.`;
    reasons.push(`amount due not available from ${options.sourceName}`);
  } else if (Math.abs(line.amount - invoice.amountDue) < EPSILON) {
    score += WEIGHTS.exactAmount;
    reasons.push('same amount');
  } else if (line.amount < invoice.amountDue) {
    score += WEIGHTS.partPayment;
    reasons.push(
      `part-payment: ${formatMoney(line.amount, currency)} of ${formatMoney(invoice.amountDue, currency)} due`
    );
  } else {
    // More than is due: a payment can't be recorded, and an overpayment isn't a match.
    return undefined;
  }

  const numberAt = invoice.number ? foundIn(line, containsCompact(invoice.number)) : undefined;
  if (numberAt) {
    score += WEIGHTS.number;
    reasons.push(`${numberAt} has ${invoice.number}`);
  }
  const refAt =
    invoice.reference && compact(invoice.reference) !== compact(invoice.number ?? '')
      ? foundIn(line, containsCompact(invoice.reference))
      : undefined;
  if (refAt) {
    score += WEIGHTS.reference;
    reasons.push(`${refAt} has ${invoice.reference}`);
  }
  const keyword = invoice.contact?.name ? contactKeyword(invoice.contact.name) : undefined;
  const contactAt = keyword ? foundIn(line, containsWord(keyword)) : undefined;
  if (contactAt) {
    score += WEIGHTS.contact;
    reasons.push(`${contactAt} has ${invoice.contact.name}`);
  }
  const when = dateReason(line, invoice);
  if (when) {
    score += WEIGHTS.date;
    reasons.push(when);
  }
  return { invoice, score, reasons, payable, blocked };
}

function bySuggestion(line: BankLine) {
  return (a: Suggestion, b: Suggestion) =>
    b.score - a.score ||
    Math.abs(days(a.invoice.dueDate ?? a.invoice.date, line.date)) -
      Math.abs(days(b.invoice.dueDate ?? b.invoice.date, line.date)) ||
    (a.invoice.number ?? '').localeCompare(b.invoice.number ?? '');
}

/** Invoices in another currency that the line names (by number or contact), to explain why they aren't offered. */
function namedInOtherCurrency(line: BankLine, candidates: Invoice[], options: MatchOptions) {
  const currency = lineCurrency(line, options);
  return candidates.filter((invoice) => {
    if (invoice.type !== documentType(line) || invoice.status !== 'authorised') return false;
    if (!invoice.currency || sameCurrency(invoice.currency, currency)) return false;
    const keyword = invoice.contact?.name ? contactKeyword(invoice.contact.name) : undefined;
    return (
      (!!invoice.number && !!foundIn(line, containsCompact(invoice.number))) ||
      (!!keyword && !!foundIn(line, containsWord(keyword)))
    );
  });
}

/** Suggestions for one line, best first, ignoring what's already in the books. */
export function suggestForLine(
  line: BankLine,
  candidates: Invoice[],
  options: MatchOptions
): Exclude<LineOutcome, { kind: 'already-recorded' }> {
  if (!lineCurrency(line, options)) {
    return {
      kind: 'not-comparable',
      reason: `The account's currency isn't available from ${options.sourceName}, so Bookie can't compare it with invoices.`,
    };
  }
  if (!(line.amount > 0)) {
    return { kind: 'not-comparable', reason: 'The line has no amount to match.' };
  }
  const suggestions = candidates
    .map((invoice) => scoreCandidate(line, invoice, options))
    .filter((s): s is Suggestion => !!s && s.score >= SUGGEST_AT)
    .sort(bySuggestion(line))
    .slice(0, options.limit ?? 5);
  const otherCurrency = namedInOtherCurrency(line, candidates, options);
  return suggestions.length
    ? { kind: 'suggestions', suggestions, otherCurrency }
    : { kind: 'no-match', otherCurrency };
}

/**
 * "Find & match": every open document of the right kind and currency whose
 * number, reference or contact contains `query` (all of them when it's empty),
 * best first. No threshold: the person is choosing.
 */
export function searchCandidates(
  line: BankLine,
  candidates: Invoice[],
  query: string | undefined,
  options: MatchOptions
): Suggestion[] {
  const q = query?.trim().toLowerCase();
  return candidates
    .filter(
      (invoice) =>
        !q ||
        [invoice.number, invoice.reference, invoice.contact?.name].some((field) =>
          field?.toLowerCase().includes(q)
        )
    )
    .map((invoice) => scoreCandidate(line, invoice, options))
    .filter((s): s is Suggestion => !!s)
    .sort(bySuggestion(line))
    .slice(0, options.limit ?? 25);
}

const isIncoming = (t: BankTransaction) => t.type === 'receive' || t.type === 'transfer-in';

/**
 * The unreconciled entry in the books that this line already is: same
 * direction and amount, within a week. Entries that name a document in the
 * line come first, then the nearest date. `used` holds entries already
 * claimed by earlier lines, so one entry explains one line.
 */
export function findRecorded(
  line: BankLine,
  entries: BankTransaction[],
  used: Set<string> = new Set()
): BankTransaction | undefined {
  const named = (t: BankTransaction) =>
    !!t.document?.number && !!foundIn(line, containsCompact(t.document.number));
  return entries
    .filter(
      (t) =>
        !t.isReconciled &&
        t.status === 'authorised' &&
        !used.has(entryKey(t)) &&
        isIncoming(t) === (line.direction === 'in') &&
        Math.abs(t.amount - line.amount) < EPSILON &&
        Math.abs(days(t.date, line.date)) <= RECORDED_WINDOW_DAYS
    )
    .sort(
      (a, b) =>
        Number(named(b)) - Number(named(a)) ||
        Math.abs(days(a.date, line.date)) - Math.abs(days(b.date, line.date)) ||
        a.id.localeCompare(b.id)
    )[0];
}

const entryKey = (t: BankTransaction) => `${t.source ?? ''}:${t.id}`;

/**
 * Outcomes for every line. Lines are taken oldest first so each existing entry
 * is claimed by the nearest earlier line; the result is keyed by line id.
 */
export function reconcileLines(
  lines: BankLine[],
  candidates: Invoice[],
  entries: BankTransaction[],
  options: MatchOptions
): Map<string, LineOutcome> {
  const used = new Set<string>();
  const outcomes = new Map<string, LineOutcome>();
  const ordered = [...lines].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );
  for (const line of ordered) {
    const entry = findRecorded(line, entries, used);
    if (entry) {
      used.add(entryKey(entry));
      outcomes.set(line.id, { kind: 'already-recorded', entry });
    } else {
      outcomes.set(line.id, suggestForLine(line, candidates, options));
    }
  }
  return outcomes;
}
