import { DEMO_WALLET_BC_BANK, demoTxid } from '@/lib/bitcoin/demo';
import type { DemoData } from '../data';
import { ConnectorError } from '../../types';
import type { BitcoinWalletsModule, BtcJournalDraft, BtcLedgerEntry } from '../../types';
import { demoSlot } from './state';

/**
 * The demo organisation's BTC bank account ledger: fictional entries chosen to show
 * each reconcile outcome against the demo wallet (lib/bitcoin/demo.ts):
 * - a receipt recorded with its txid (matched by txid);
 * - a payment recorded a day late without a txid (matched by amount);
 * - a receipt with its txid but a different amount (matched, amounts differ);
 * - an adjustment with no transaction on chain (in the books, not on chain).
 * October's two transactions are left for "on chain, not in the books".
 */
function seedLedger(): BtcLedgerEntry[] {
  return [
    {
      id: 'demo-btc-1',
      entryNumber: 1,
      postingDate: '2026-08-03',
      documentNumber: 'RCPT-1042',
      externalDocumentNumber: demoTxid('receive-aug').slice(0, 35).toUpperCase(),
      description: 'Northwind Traders, invoice INV-0042',
      amountSats: 25_000_000,
      open: false,
    },
    {
      id: 'demo-btc-2',
      entryNumber: 2,
      postingDate: '2026-08-22',
      documentNumber: 'PAY-0318',
      description: 'Fabrikam Green Coffee, bill 0318',
      amountSats: -5_002_100,
      open: true,
    },
    {
      id: 'demo-btc-3',
      entryNumber: 3,
      postingDate: '2026-09-15',
      documentNumber: 'RCPT-1057',
      externalDocumentNumber: demoTxid('receive-sep').slice(0, 35).toUpperCase(),
      description: 'Contoso Café Kiosk, invoice INV-0057',
      amountSats: 1_150_000,
      open: true,
    },
    {
      id: 'demo-btc-4',
      entryNumber: 4,
      postingDate: '2026-09-30',
      documentNumber: 'ADJ-0007',
      description: 'Quarter-end adjustment',
      amountSats: 200_000,
      open: true,
    },
  ];
}

interface DemoBtcState {
  ledger: BtcLedgerEntry[];
  drafts: BtcJournalDraft[];
  next: number;
}

export function demoBitcoin(data: DemoData): BitcoinWalletsModule {
  const state = () =>
    demoSlot<DemoBtcState>(data, 'bitcoin', () => ({ ledger: seedLedger(), drafts: [], next: 1 }));
  const known = (bank: string) => {
    if (bank !== DEMO_WALLET_BC_BANK)
      throw new ConnectorError('Bank account not found.', 404, 'demo');
  };

  return {
    // Demo wallets come from the demo fixtures, not from the books.
    async wallets() {
      return { status: 'ok', wallets: [] };
    },
    async ledger(bank) {
      known(bank);
      return { status: 'ok', entries: [...state().ledger] };
    },
    async drafts(bank) {
      known(bank);
      return state().drafts.filter((d) => d.lines.every((l) => l.bankAccountNumber === bank));
    },
    async draftJournal(lines) {
      if (lines.length === 0)
        throw new ConnectorError('Choose at least one transaction.', 400, 'demo');
      lines.forEach((l) => known(l.bankAccountNumber));
      const s = state();
      const draft: BtcJournalDraft = {
        batchId: `demo-btc-batch-${s.next}`,
        batchCode: `BTCDEMO${String(s.next).padStart(3, '0')}`,
        lines,
      };
      s.next++;
      s.drafts.push(draft);
      return draft;
    },
    async postJournal(bank, batchId) {
      known(bank);
      const s = state();
      const draft = s.drafts.find((d) => d.batchId === batchId);
      if (!draft || !draft.lines.every((l) => l.bankAccountNumber === bank)) {
        throw new ConnectorError(
          'That journal batch isn’t one Bookie drafted for this wallet, so Bookie won’t post it.',
          400,
          'demo'
        );
      }
      for (const line of draft.lines) {
        const entryNumber = s.ledger.length + 1;
        s.ledger.push({
          id: `demo-btc-${entryNumber}`,
          entryNumber,
          postingDate: line.postingDate,
          documentNumber: line.documentNumber,
          externalDocumentNumber: line.externalDocumentNumber.toUpperCase(),
          description: line.description,
          amountSats: line.amountSats,
          open: true,
        });
      }
      s.drafts = s.drafts.filter((d) => d.batchId !== batchId);
    },
  };
}
