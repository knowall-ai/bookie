import type { IsoDate } from '@/lib/domain/types';
import type { LedgerJournal } from '@/lib/reports/ledger';
import { xeroDate, type XeroClient } from '../client';
import { ConnectorError } from '../../types';
import type { XeroJournal } from './accounts';

/** Xero's names for what created a journal (`Journal.SourceType`), as its reports show them. */
export const XERO_SOURCE_TYPES: Record<string, string> = {
  ACCREC: 'Receivable Invoice',
  ACCPAY: 'Payable Invoice',
  ACCRECCREDIT: 'Receivable Credit Note',
  ACCPAYCREDIT: 'Payable Credit Note',
  ACCRECPAYMENT: 'Receivable Payment',
  ACCPAYPAYMENT: 'Payable Payment',
  ARCREDITPAYMENT: 'Receivable Credit Note Payment',
  APCREDITPAYMENT: 'Payable Credit Note Payment',
  CASHREC: 'Receive Money',
  CASHPAID: 'Spend Money',
  TRANSFER: 'Bank Transfer',
  ARPREPAYMENT: 'Receivable Prepayment',
  APPREPAYMENT: 'Payable Prepayment',
  AROVERPAYMENT: 'Receivable Overpayment',
  APOVERPAYMENT: 'Payable Overpayment',
  EXPCLAIM: 'Expense Claim',
  EXPPAYMENT: 'Expense Claim Payment',
  MANJOURNAL: 'Manual Journal',
  PAYSLIP: 'Payslip',
  WAGEPAYABLE: 'Wage Payable',
  INTEGRATEDPAYROLLPE: 'Payroll Expense',
  INTEGRATEDPAYROLLPT: 'Payroll Payment',
  EXTERNALSPENDMONEY: 'External Spend Money',
  INTEGRATEDPAYROLLPTPAYMENT: 'Payroll Tax Payment',
  INTEGRATEDPAYROLLCN: 'Payroll Credit Note',
};

export function fromXeroJournalToLedger(journal: XeroJournal): LedgerJournal {
  return {
    id: journal.JournalID,
    number: String(journal.JournalNumber),
    date: xeroDate(journal.JournalDate) ?? '',
    source: journal.SourceType
      ? (XERO_SOURCE_TYPES[journal.SourceType] ?? journal.SourceType)
      : undefined,
    reference: journal.Reference || undefined,
    lines: journal.JournalLines.map((line) => ({
      accountCode: line.AccountCode ?? '',
      accountName: line.AccountName || undefined,
      description: line.Description || undefined,
      // NetAmount is always present on posted journal lines; a line without it carries nothing.
      amount: line.NetAmount ?? 0,
    })),
  };
}

/** Xero returns 100 journals per call. */
const PER_CALL = 100;
/** Calls in flight at once (Xero allows 5 concurrent calls per organisation). */
const PARALLEL = 3;
/** Most calls one report may make: 30 calls = 3,000 journals. */
export const MAX_JOURNAL_CALLS = 30;

/**
 * Days before the report start to begin reading. Xero only lets us start from
 * when a journal was *entered* (If-Modified-Since); a transaction entered
 * before its own date (future-dated) is still found if entered within this window.
 */
export const LOOKBACK_DAYS = 31;

export function lookbackStart(from: IsoDate, days = LOOKBACK_DAYS): IsoDate {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Every journal entered since `since`, up to now. Xero numbers journals in the
 * order they're entered, so after the first call (If-Modified-Since) we page
 * forward by journal number, a few pages at a time. Backdated entries made
 * later are included because we read to the end.
 */
export async function journalsEnteredSince(
  client: XeroClient,
  since: IsoDate,
  maxCalls = MAX_JOURNAL_CALLS
): Promise<XeroJournal[]> {
  const fetchPage = (offset: number, headers?: Record<string, string>) =>
    client
      .request<{ Journals: XeroJournal[] }>('Journals', { query: { offset }, headers })
      .then((r) => r.Journals ?? []);

  const seen = new Map<string, XeroJournal>();
  const add = (page: XeroJournal[]) => page.forEach((j) => seen.set(j.JournalID, j));
  const first = await fetchPage(0, { 'If-Modified-Since': `${since}T00:00:00` });
  add(first);
  let calls = 1;
  let done = first.length < PER_CALL;
  let offset = Math.max(0, ...first.map((j) => j.JournalNumber));
  while (!done) {
    if (calls + PARALLEL > maxCalls) {
      throw new ConnectorError(
        `This period needs more than ${(maxCalls * PER_CALL).toLocaleString('en-GB')} journals from Xero. Choose a later start date.`,
        400,
        'xero'
      );
    }
    const pages = await Promise.all(
      Array.from({ length: PARALLEL }, (_, i) => fetchPage(offset + i * PER_CALL))
    );
    calls += PARALLEL;
    pages.forEach(add);
    done = pages.some((p) => p.length < PER_CALL);
    offset = Math.max(offset, ...pages.flat().map((j) => j.JournalNumber));
  }
  return [...seen.values()];
}
