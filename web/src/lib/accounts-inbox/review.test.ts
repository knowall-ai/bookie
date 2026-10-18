import { describe, expect, it, vi } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '@/lib/connectors/demo';
import { DEMO_MEMBER } from '@/lib/auth/dev';
import type { AuthContext } from '@/lib/auth/context';
import { DemoMailbox } from '@/lib/mail/demo';
import { reviewMailbox, reviewOne } from './review';

const auth: AuthContext = {
  mode: 'demo',
  user: DEMO_MEMBER,
  getToken: async () => {
    throw new Error('no tokens');
  },
};

describe('reviewMailbox over the demo mailbox', () => {
  const connector = createDemoConnector(DEMO_ORGS[0]);

  it('gives each fixture the right verdict', async () => {
    const items = await reviewMailbox(auth, new DemoMailbox(), connector, 4);
    const byId = Object.fromEntries(items.map((i) => [i.messageId, i]));

    // The lookalike is suspicious and was never read.
    expect(byId['demo-mail-lookalike'].verdict.kind).toBe('suspicious');
    expect(byId['demo-mail-lookalike'].reading).toBeUndefined();

    const inBooks = byId['demo-mail-in-books'].verdict;
    expect(inBooks.kind === 'in-books' && inBooks.match.status).toBe('same');

    const fresh = byId['demo-mail-new'];
    expect(fresh.verdict.kind).toBe('new');
    expect(fresh.trust.level).toBe('trusted');
    expect(fresh.supplier).toMatchObject({ status: 'matched', by: 'tax-number' });
    expect(fresh.bank).toEqual({ status: 'matches' });
    expect(fresh.reading?.needsReview).toEqual([]);

    expect(byId['demo-mail-statement'].verdict).toMatchObject({
      kind: 'not-invoice',
      documentKind: 'statement',
    });

    const newSupplier = byId['demo-mail-new-supplier'];
    expect(newSupplier.verdict.kind).toBe('new');
    expect(newSupplier.supplier?.status).toBe('none');

    const moved = byId['demo-mail-address-changed'];
    expect(moved.verdict.kind).toBe('new');
    expect(moved.diffs?.map((d) => d.field)).toEqual(['address', 'phone']);

    // Genuine mail, but new bank details: suspicious, and no supplier update offered for them.
    const bank = byId['demo-mail-bank-changed'];
    expect(bank.verdict.kind).toBe('suspicious');
    expect(bank.bank?.status).toBe('differs');
    expect(bank.diffs?.some((d) => JSON.stringify(d).includes('77341920'))).toBe(false);
  });

  it('never asks the model in the demo', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await reviewOne(auth, new DemoMailbox(), connector, 'demo-mail-new', 'att-1');
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});
