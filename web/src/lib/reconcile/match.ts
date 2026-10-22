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

/** A real calendar date in `YYYY-MM-DD` form (not 2026-13-01 or 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

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

/**
 * Whether a field contains a document number or reference. Letters-and-digits
 * numbers ("INV-0042") match ignoring spaces, dashes and case. All-digit
 * numbers ("103021") must be a whole word of at least four digits, so they
 * don't match inside sort codes, account or card numbers.
 */
const containsCompact = (needle: string) => {
  const n = compact(needle);
  if (/^\d+$/.test(n)) {
    return (field: string) => n.length >= 4 && words(field).includes(n.toLowerCase());
  }
  // Very short codes ("A1") would match almost any reference.
  return (field: string) => n.length >= 3 && compact(field).includes(n);
};

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const containsWord = (word: string) => (field: string) => words(field).includes(word);

function dateReason(line: BankLine, invoice: Invoice): string | undefined {
  const before = days(invoice.date, line.date);
  if (!Number.isFinite(before) || before < -BEFORE_INVOICE_DAYS) return undefined;
  const anchor = invoice.dueDate ?? invoice.date;
  const label = invoice.dueDate ? 'due date' : 'invoice date';
  const diff = days(anchor, line.date);
  if (!Number.isFinite(diff) || diff > AFTER_DUE_DAYS) return undefined;
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
    // Only the distinctive word is looked for, so that's what the reason names.
    reasons.push(`${contactAt} has ${titleCase(keyword!)}`);
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

/** True when the entry is a payment on a document the line names by number. */
const namesEntry = (line: BankLine, t: BankTransaction) =>
  !!t.document?.number && !!foundIn(line, containsCompact(t.document.number));

/**
 * The unreconciled entry in the books that this line already is: same
 * direction and amount, within a week. Entries whose document the line names
 * come first, then the nearest date. `used` holds entries already claimed by
 * other lines, so one entry explains one line; `namedOnly` keeps only entries
 * whose document the line names.
 */
export function findRecorded(
  line: BankLine,
  entries: BankTransaction[],
  used: Set<string> = new Set(),
  namedOnly = false
): BankTransaction | undefined {
  return entries
    .filter(
      (t) =>
        !t.isReconciled &&
        t.status === 'authorised' &&
        !used.has(entryKey(t)) &&
        isIncoming(t) === (line.direction === 'in') &&
        Math.abs(t.amount - line.amount) < EPSILON &&
        Math.abs(days(t.date, line.date)) <= RECORDED_WINDOW_DAYS &&
        (!namedOnly || namesEntry(line, t))
    )
    .sort(
      (a, b) =>
        Number(namesEntry(line, b)) - Number(namesEntry(line, a)) ||
        Math.abs(days(a.date, line.date)) - Math.abs(days(b.date, line.date)) ||
        a.id.localeCompare(b.id)
    )[0];
}

export const entryKey = (t: BankTransaction) => `${t.source ?? ''}:${t.id}`;

/**
 * Which line each existing entry explains. Entries go first to lines that
 * name their document, then by amount to the other lines, oldest first, so
 * two lines for the same amount never both claim one payment.
 */
export function assignRecorded(
  lines: BankLine[],
  entries: BankTransaction[]
): Map<string, BankTransaction> {
  const used = new Set<string>();
  const assigned = new Map<string, BankTransaction>();
  const ordered = [...lines].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );
  for (const namedOnly of [true, false]) {
    for (const line of ordered) {
      if (assigned.has(line.id)) continue;
      const entry = findRecorded(line, entries, used, namedOnly);
      if (entry) {
        used.add(entryKey(entry));
        assigned.set(line.id, entry);
      }
    }
  }
  return assigned;
}

/** Outcomes for every line, keyed by line id. */
export function reconcileLines(
  lines: BankLine[],
  candidates: Invoice[],
  entries: BankTransaction[],
  options: MatchOptions
): Map<string, LineOutcome> {
  const assigned = assignRecorded(lines, entries);
  return new Map(
    lines.map((line): [string, LineOutcome] => {
      const entry = assigned.get(line.id);
      return [
        line.id,
        entry ? { kind: 'already-recorded', entry } : suggestForLine(line, candidates, options),
      ];
    })
  );
}

/**
 * A payment of the line's amount already on this very document within a week
 * of the line, reconciled or not: recording another would count the money
 * twice. Checks the document's own payments and register entries for it.
 */
export function paidAlready(
  line: BankLine,
  invoice: Invoice,
  entries: BankTransaction[] = []
): { date: IsoDate; amount: number } | undefined {
  const near = (date: IsoDate, amount: number) =>
    Math.abs(amount - line.amount) < EPSILON &&
    Math.abs(days(date, line.date)) <= RECORDED_WINDOW_DAYS;
  const own = invoice.payments?.find((p) => near(p.date, p.amount));
  if (own) return { date: own.date, amount: own.amount };
  const entry = entries.find(
    (t) => t.status === 'authorised' && t.document?.id === invoice.id && near(t.date, t.amount)
  );
  return entry ? { date: entry.date, amount: entry.amount } : undefined;
}
