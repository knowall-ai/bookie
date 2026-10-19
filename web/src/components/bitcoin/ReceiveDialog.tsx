'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, QrCode, X } from 'lucide-react';
import type { ReceiveAddress } from '@/lib/bitcoin/wallets';
import { bip21Uri, parseBtcAmount } from '@/lib/bitcoin/receive';
import { bitcoinReceiveAddressAction } from '@/lib/portal/actions/bitcoin';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; receive: ReceiveAddress };

/** "Receive" on a wallet page: a fresh address from the server, as a BIP21 QR code. */
export function ReceiveButton({ orgKey, walletId }: { orgKey: string; walletId: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  return (
    <>
      <Button
        ref={triggerRef}
        variant="primary"
        onClick={() => setOpen(true)}
        data-testid="wallet-receive"
      >
        <QrCode className="h-4 w-4" aria-hidden />
        Receive
      </Button>
      {open && <ReceiveDialog orgKey={orgKey} walletId={walletId} onClose={close} />}
    </>
  );
}

function ReceiveDialog({
  orgKey,
  walletId,
  onClose,
}: {
  orgKey: string;
  walletId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    bitcoinReceiveAddressAction({ orgKey, walletId }).then(
      (result) => {
        if (!live) return;
        setState(
          result.ok
            ? { status: 'ready', receive: result.data }
            : { status: 'error', message: result.error }
        );
      },
      () => live && setState({ status: 'error', message: 'Bookie could not load an address.' })
    );
    return () => {
      live = false;
    };
  }, [orgKey, walletId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Keep Tab inside the dialog while it is open.
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input'),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const network = state.status === 'ready' ? state.receive.network : undefined;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receive-title"
        className="card max-h-full w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
        data-testid="receive-dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="receive-title" className="text-ink text-lg font-semibold">
            Receive bitcoin
          </h2>
          <Button ref={closeRef} variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {network && (
          <p className="mt-1 text-sm" data-testid="receive-network">
            {network === 'testnet' ? (
              <Badge tone="amber">Testnet: not real bitcoin</Badge>
            ) : (
              <span className="text-muted">Bitcoin mainnet</span>
            )}
          </p>
        )}

        <div className="mt-4">
          {state.status === 'loading' && (
            <p className="text-muted text-sm" aria-live="polite">
              Reading the wallet to find an unused address…
            </p>
          )}
          {state.status === 'error' && (
            <p className="text-danger text-sm" role="alert">
              {state.message}
            </p>
          )}
          {state.status === 'ready' && !state.receive.ok && (
            <p className="text-muted text-sm" role="alert" data-testid="receive-unavailable">
              {state.receive.reason}
            </p>
          )}
          {state.status === 'ready' && state.receive.ok && (
            <ReceiveDetails
              address={state.receive.address}
              index={state.receive.index}
              demo={state.receive.demo}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiveDetails({
  address,
  index,
  demo,
}: {
  address: string;
  index: number;
  demo?: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [svg, setSvg] = useState<string>();
  const [copied, setCopied] = useState(false);
  const parsed = amount.trim() ? parseBtcAmount(amount) : undefined;
  const amountBtc = parsed?.ok ? parsed.btc : undefined;
  const invalid = parsed !== undefined && !parsed.ok;
  const uri = bip21Uri(address, amountBtc);

  useEffect(() => {
    let live = true;
    // Black on white with a four-module quiet zone: what phone cameras read best.
    QRCode.toString(uri, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 4,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(
      (out) => live && setSvg(out),
      () => live && setSvg(undefined)
    );
    return () => {
      live = false;
    };
  }, [uri]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const label = amountBtc
    ? `QR code: pay ${amountBtc} BTC to ${address}`
    : `QR code for the address ${address}`;

  return (
    <div className="flex flex-col gap-4">
      {demo && (
        <p className="text-warn text-sm" data-testid="receive-demo-note">
          Demo wallet: this address comes from a public test key that anyone can spend from. Never
          send real bitcoin to it.
        </p>
      )}
      <div className="flex flex-col items-center gap-2">
        {invalid ? (
          // Never a code that asks for a different amount than the one typed.
          <div
            className="border-line text-muted flex h-60 w-60 items-center justify-center rounded-lg border border-dashed p-6 text-center text-sm"
            data-testid="receive-qr-hidden"
          >
            Correct the amount to show the QR code.
          </div>
        ) : (
          <div
            role="img"
            aria-label={label}
            data-testid="receive-qr"
            data-uri={uri}
            className="h-60 w-60 rounded-lg bg-white [&>svg]:h-full [&>svg]:w-full"
            // The SVG is the qrcode library's output for our own URI: modules only, no text.
            dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
          />
        )}
        <p className="text-faint text-xs" aria-live="polite" data-testid="receive-qr-caption">
          {invalid
            ? 'No QR code until the amount is valid'
            : amountBtc
              ? `Asks for ${amountBtc} BTC`
              : 'No amount in this code'}
        </p>
      </div>

      <div>
        <p className="text-body text-sm font-medium">Address</p>
        <div className="mt-1.5 flex items-start gap-2">
          <code
            className="bg-surface-2 text-ink flex-1 rounded-lg px-3 py-2 font-mono text-sm break-all"
            data-testid="receive-address"
          >
            {address}
          </code>
          <Button size="md" onClick={copy} aria-label="Copy address" data-testid="receive-copy">
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="text-muted mt-2 text-xs">
          A new address from this wallet. Each payment should use a fresh address; this one changes
          once it has received a payment. (Receive address {index.toLocaleString('en-GB')}.)
        </p>
      </div>

      <Field
        label="Amount (BTC, optional)"
        htmlFor="receive-amount"
        hint="Adds the amount to the QR code. The payer can still change it."
        error={parsed && !parsed.ok ? parsed.error : undefined}
      >
        <Input
          id="receive-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0015"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={parsed ? !parsed.ok : undefined}
          aria-describedby={parsed && !parsed.ok ? 'receive-amount-error' : undefined}
          data-testid="receive-amount"
        />
      </Field>
    </div>
  );
}
