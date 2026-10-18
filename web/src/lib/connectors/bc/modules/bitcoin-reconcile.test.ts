import { describe, expect, it, vi } from 'vitest';
import { ConnectorError } from '../../types';
import type { BcClient } from '../client';
import { bcBitcoin } from './bitcoin';

/* Reconcile: ledger entries, drafting and posting, against a scripted fake BC. Fictional data. */

const BATCH = '0f0f0f0f-1111-2222-3333-444444444444';

function fakeBc(options: { extension?: boolean; batchCode?: string; lines?: object[] } = {}) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const request = vi.fn(
    async (path: string, req: { method?: string; body?: unknown; api?: string } = {}) => {
      calls.push({ path, method: req.method ?? 'GET', body: req.body });
      if (path === 'companySetup') {
        if (options.extension === false)
          throw new ConnectorError('Not found', 404, 'business-central');
        return { value: [{ lcyCode: 'GBP' }] };
      }
      if (path === 'journals' && req.method === 'POST') {
        return { id: BATCH, code: (req.body as { code: string }).code };
      }
      if (path === `journals(${BATCH})` && !req.method) {
        return { id: BATCH, code: options.batchCode ?? 'BTCABC1234' };
      }
      return {};
    }
  );
  const all = vi.fn(async (path: string) => {
    if (path === 'bankAccountLedgerEntries') {
      return [
        {
          id: 'e1',
          entryNumber: 1,
          bankAccountNumber: 'BTC-01',
          postingDate: '2026-09-10',
          amount: 0.0015,
          externalDocumentNumber: 'ABC',
        },
        {
          id: 'e2',
          entryNumber: 2,
          bankAccountNumber: 'BTC-01',
          postingDate: '2026-09-11',
          amount: -0.0001,
          reversed: true,
        },
      ];
    }
    if (path === `journals(${BATCH})/journalLines`) return options.lines ?? [];
    return [];
  });
  const client = {
    tenantId: `t-${Math.random()}`,
    environment: 'Sandbox',
    companyId: 'c1',
    request,
    all,
  } as unknown as BcClient;
  return { client, calls, all };
}

const bankLine = (over: object = {}) => ({
  id: 'l1',
  journalId: BATCH,
  accountType: 'Bank_x0020_Account',
  accountNumber: 'BTC-01',
  postingDate: '2026-09-10',
  amount: -0.0006,
  ...over,
});

describe('bcBitcoin reconcile', () => {
  it('reads the BTC bank ledger in satoshis and leaves reversed entries out', async () => {
    const { client, all } = fakeBc();
    const ledger = await bcBitcoin(client).ledger!('BTC-01');
    expect(ledger).toEqual({
      status: 'ok',
      entries: [
        expect.objectContaining({ id: 'e1', amountSats: 150_000, postingDate: '2026-09-10' }),
      ],
    });
    expect(all).toHaveBeenCalledWith(
      'bankAccountLedgerEntries',
      expect.objectContaining({ $filter: "bankAccountNumber eq 'BTC-01'" }),
      10,
      'knowallBookie/bookie/v1.0'
    );
  });

  it('needs the Bookie BC API extension for the ledger', async () => {
    const { client } = fakeBc({ extension: false });
    expect(await bcBitcoin(client).ledger!('BTC-01')).toMatchObject({ status: 'unavailable' });
  });

  it('drafts lines on a new BTC batch, in BTC, with the txid as external document no.', async () => {
    const { client, calls } = fakeBc();
    const draft = await bcBitcoin(client).draftJournal!([
      {
        bankAccountNumber: 'BTC-01',
        postingDate: '2026-09-10',
        documentNumber: 'BTC-AAAAAAAAAAAA',
        externalDocumentNumber: 'a'.repeat(35),
        description: `BTC ${'a'.repeat(64)}`,
        amountSats: -3_000_000,
        balancingAccountNumber: '2190',
      },
    ]);
    expect(draft.batchCode).toMatch(/^BTC[0-9A-Z]{7}$/);
    const line = calls.find((c) => c.path.endsWith('/journalLines') && c.method === 'POST');
    expect(line?.body).toEqual({
      accountType: 'Bank Account',
      accountNumber: 'BTC-01',
      postingDate: '2026-09-10',
      documentNumber: 'BTC-AAAAAAAAAAAA',
      externalDocumentNumber: 'a'.repeat(35),
      amount: -0.03,
      description: `BTC ${'a'.repeat(64)}`,
      balanceAccountType: 'G/L Account',
      balancingAccountNumber: '2190',
    });
    // Drafting never posts.
    expect(calls.some((c) => c.path.includes('Microsoft.NAV.post'))).toBe(false);
  });

  it('posts only its own BTC batch with only this bank account’s lines', async () => {
    const ok = fakeBc({ lines: [bankLine()] });
    await bcBitcoin(ok.client).postJournal!('BTC-01', BATCH);
    expect(ok.calls.some((c) => c.path === `journals(${BATCH})/Microsoft.NAV.post`)).toBe(true);

    const foreignBatch = fakeBc({ batchCode: 'GENERAL', lines: [bankLine()] });
    await expect(bcBitcoin(foreignBatch.client).postJournal!('BTC-01', BATCH)).rejects.toThrow(
      /won’t post/
    );

    const otherBank = fakeBc({
      lines: [bankLine(), bankLine({ id: 'l2', accountNumber: 'GBP-01' })],
    });
    await expect(bcBitcoin(otherBank.client).postJournal!('BTC-01', BATCH)).rejects.toThrow(
      /won’t post/
    );

    const notGuid = fakeBc();
    await expect(bcBitcoin(notGuid.client).postJournal!('BTC-01', '../journals')).rejects.toThrow(
      /Unknown/
    );
  });
});
