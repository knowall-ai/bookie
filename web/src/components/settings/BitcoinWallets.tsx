'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Bitcoin, Plus, Trash2 } from 'lucide-react';
import type { ElectrumStatus, WalletSummary } from '@/lib/bitcoin/wallets';
import { addBitcoinWalletAction, removeBitcoinWalletAction } from '@/lib/portal/actions/bitcoin';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/lib/ui/format';

const SCRIPT_TYPE_OPTIONS = [
  { value: 'wpkh', label: 'Native SegWit (P2WPKH, bc1q…)' },
  { value: 'tr', label: 'Taproot (P2TR, bc1p…)' },
  { value: 'sh-wpkh', label: 'Nested SegWit (P2SH-P2WPKH, 3…)' },
  { value: 'pkh', label: 'Legacy (P2PKH, 1…)' },
] as const;

type ScriptChoice = '' | (typeof SCRIPT_TYPE_OPTIONS)[number]['value'];

const EMPTY = {
  name: '',
  orgKey: '',
  key: '',
  scriptType: '' as ScriptChoice,
};

/** Settings › Bitcoin wallets: add or remove watch-only wallets (members only). */
export function BitcoinWallets({
  wallets,
  orgs,
  electrum,
}: {
  wallets: WalletSummary[];
  orgs: { key: string; name: string; sourceLabel?: string }[];
  electrum: ElectrumStatus;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, orgKey: orgs[0]?.key ?? '' });
  const [removing, setRemoving] = useState<WalletSummary | null>(null);
  const orgName = (key: string) =>
    orgs.find((o) => o.key === key)?.name ?? 'an organisation you can’t see';
  // A bare xpub/tpub doesn't say which addresses it makes; ypub/zpub and descriptors do.
  const needsScriptType = /^\s*[xt]pub/.test(form.key) && !form.key.includes('(');

  const add = () =>
    start(async () => {
      const result = await addBitcoinWalletAction({
        name: form.name,
        orgKey: form.orgKey,
        key: form.key,
        scriptType: needsScriptType && form.scriptType ? form.scriptType : undefined,
      });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Added ${result.data.name} (${result.data.typeLabel})`);
      setForm({ ...EMPTY, orgKey: form.orgKey });
      setShowForm(false);
      router.refresh();
    });

  const remove = (wallet: WalletSummary) =>
    start(async () => {
      const result = await removeBitcoinWalletAction(wallet.id);
      setRemoving(null);
      if (!result.ok) return void toast.error(result.error);
      toast.success('Wallet removed');
      router.refresh();
    });

  return (
    <section
      className="card overflow-hidden"
      aria-labelledby="bitcoin-title"
      data-testid="bitcoin-wallets"
    >
      <div className="border-line flex items-start gap-4 border-b p-5">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f7931a] text-white"
          aria-hidden="true"
        >
          <Bitcoin className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="bitcoin-title" className="text-ink text-lg font-semibold">
            Bitcoin wallets
          </h2>
          <p className="text-muted mt-0.5 text-sm">
            Show a Bitcoin wallet as a bank account, read live from the blockchain. Bookie needs
            only the wallet’s public key (xpub) or output descriptor: it can see the wallet but
            never spend from it.
          </p>
          <p className="text-faint mt-1 text-xs" data-testid="bitcoin-bc-note">
            Business Central companies keep the wallet on the bank account in Business Central
            itself (the Bookie Bitcoin extension), so they aren’t listed here. Add wallets here for
            other organisations.
          </p>
        </div>
      </div>

      <div className="p-5">
        {!electrum.configured ? (
          <p
            className="text-warn mb-4 flex items-start gap-2 text-sm"
            data-testid="electrum-missing"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              No Electrum server configured. Bookie reads wallets through an Electrum server set in
              BOOKIE_ELECTRUM_URL; until one is set, wallets show no transactions.
              {electrum.error ? ` (${electrum.error})` : ''}
            </span>
          </p>
        ) : electrum.privacyWarning ? (
          <p
            className="text-warn mb-4 flex items-start gap-2 text-sm"
            data-testid="electrum-privacy"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              This Bookie installation uses an Electrum server its operator hasn’t marked as their
              own. That server learns every address in your wallets and can link them together.
              {electrum.plaintext ? ' The connection is not encrypted.' : ''}
            </span>
          </p>
        ) : null}

        {wallets.length > 0 && (
          <ul className="divide-line mb-5 divide-y" data-testid="bitcoin-wallet-list">
            {wallets.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-ink font-medium">{w.name}</p>
                  <p className="text-muted mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="amber">{w.typeLabel}</Badge>
                    {w.network === 'testnet' && <Badge tone="violet">Testnet</Badge>}
                    {w.demo && <Badge>Demo data</Badge>}
                    <span>In {orgName(w.orgKey)}</span>
                    {w.bcBankAccountNumber && <span>BC bank account {w.bcBankAccountNumber}</span>}
                    {!w.hasChange && <span>Receive chain only</span>}
                    <span>
                      Added by {w.createdBy} on {formatDate(w.createdAt)}
                    </span>
                  </p>
                </div>
                {!w.demo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRemoving(w)}
                    aria-label={`Remove ${w.name}`}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!showForm && (
          <Button
            variant="secondary"
            onClick={() => setShowForm(true)}
            disabled={orgs.length === 0}
            data-testid="add-bitcoin-wallet"
          >
            <Plus className="h-4 w-4" /> Add a wallet
          </Button>
        )}

        {showForm && (
          <form
            className="bg-surface-2/60 border-line grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <Field
              label="Name"
              htmlFor="wallet-name"
              hint="As it should appear under Bank accounts"
            >
              <Input
                id="wallet-name"
                value={form.name}
                maxLength={80}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Organisation" htmlFor="wallet-org">
              <Select
                id="wallet-org"
                value={form.orgKey}
                onChange={(e) => setForm({ ...form, orgKey: e.target.value })}
                required
              >
                {orgs.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.name}
                    {o.sourceLabel ? ` (${o.sourceLabel})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Extended public key or output descriptor"
              htmlFor="wallet-key"
              hint="xpub, ypub or zpub, or a descriptor such as wpkh([fingerprint/84h/0h/0h]xpub…/<0;1>/*). It is encrypted, stored in your own Microsoft 365 and never shown again."
              className="sm:col-span-2"
            >
              <Textarea
                id="wallet-key"
                rows={3}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                required
              />
            </Field>
            {needsScriptType && (
              <Field
                label="Script type"
                htmlFor="wallet-type"
                hint="An xpub doesn’t say which kind of addresses your wallet makes. Check your wallet’s settings."
              >
                <Select
                  id="wallet-type"
                  value={form.scriptType}
                  onChange={(e) => setForm({ ...form, scriptType: e.target.value as ScriptChoice })}
                  required
                >
                  <option value="">Choose…</option>
                  {SCRIPT_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="flex items-end justify-end gap-2 sm:col-span-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Checking…' : 'Add wallet'}
              </Button>
            </div>
          </form>
        )}

        {removing && (
          <ConfirmDialog
            title="Remove this wallet?"
            body={`${removing.name} will disappear from Bookie for everyone in your organisation, and Bookie will forget its public key. Nothing on the blockchain or in your books changes.`}
            cta="Remove"
            danger
            busy={pending}
            onCancel={() => setRemoving(null)}
            onConfirm={() => remove(removing)}
          />
        )}
      </div>
    </section>
  );
}
