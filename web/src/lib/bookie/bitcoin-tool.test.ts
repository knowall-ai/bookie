import { describe, expect, it, vi } from 'vitest';
import { createDemoConnector, DEMO_ORGS } from '@/lib/connectors/demo';
import { runTool, toolsFor, toolStatus } from './tools';

const connector = createDemoConnector(DEMO_ORGS.find((o) => o.key === 'demo.contoso')!);

describe('reconcile_bitcoin_wallets', () => {
  it('is offered where the books can hold a BTC bank account', () => {
    expect(toolsFor(connector).map((t) => t.name)).toContain('reconcile_bitcoin_wallets');
    expect(toolStatus('reconcile_bitcoin_wallets', '{}')).toBe('Reconciling the Bitcoin wallets…');
  });

  it('runs the read-only reconcile for the asked wallet', async () => {
    const bitcoinReconcile = vi.fn(async (wallet?: string) => ({
      status: 'ok',
      wallets: [{ wallet }],
    }));
    const output = await runTool(
      connector,
      'reconcile_bitcoin_wallets',
      '{"wallet":"Contoso Treasury"}',
      {
        bitcoinReconcile,
      }
    );
    expect(bitcoinReconcile).toHaveBeenCalledWith('Contoso Treasury');
    expect(JSON.parse(output)).toEqual({ status: 'ok', wallets: [{ wallet: 'Contoso Treasury' }] });
  });

  it('says so when there is no reconcile in this context', async () => {
    const output = await runTool(connector, 'reconcile_bitcoin_wallets', '{}', {});
    expect(JSON.parse(output)).toEqual({ error: 'Bitcoin wallets are not available here.' });
  });
});
