// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { BookieSuggestion } from '@/lib/bookie/suggestion-types';

const invoiceAction = vi.fn();
const refresh = vi.fn();
vi.mock('@/lib/portal/actions/invoices', () => ({
  invoiceAction: (...args: unknown[]) => invoiceAction(...args),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { BookieSuggestions } = await import('./BookieSuggestions');

const approve: BookieSuggestion = {
  id: 'approve_invoice:inv-1',
  title: "Approve Fabrikam's draft invoice",
  reason: 'It has been in draft for two weeks.',
  severity: 'warning',
  subject: {
    kind: 'invoice',
    label: 'Invoice INV-0042',
    href: '/portal/demo/sales/invoices/inv-1',
    contact: 'Fabrikam Ltd',
    amountDue: 1200,
    currency: 'GBP',
    dueDate: '2026-10-03',
    overdue: false,
  },
  action: {
    kind: 'invoice',
    action: 'approve',
    invoiceId: 'inv-1',
    label: 'Approve',
    confirm: {
      title: 'Approve invoice INV-0042?',
      body: 'This writes to your live books.',
      cta: 'Approve',
    },
    done: 'Invoice INV-0042 approved',
  },
};

const overdue: BookieSuggestion = {
  id: 'open_page:overdue_invoices',
  title: 'Chase overdue invoices',
  reason: 'Three invoices are overdue.',
  severity: 'issue',
  action: {
    kind: 'link',
    label: 'View overdue invoices',
    href: '/portal/demo/sales/invoices?status=overdue',
  },
};

describe('BookieSuggestions', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows each step with its record and button', () => {
    render(<BookieSuggestions orgKey="demo" suggestions={[approve, overdue]} />);
    expect(screen.getAllByTestId('bookie-suggestion')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Invoice INV-0042' })).toHaveProperty(
      'pathname',
      '/portal/demo/sales/invoices/inv-1'
    );
    expect(screen.getByText(/Fabrikam Ltd/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /View overdue invoices/ })).toBeTruthy();
  });

  it('only writes to the books after the user confirms', async () => {
    invoiceAction.mockResolvedValue({ ok: true, data: undefined });
    render(<BookieSuggestions orgKey="demo" suggestions={[approve]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(invoiceAction).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('confirm-action'));
    await waitFor(() => expect(screen.getByText('Done')).toBeTruthy());
    expect(invoiceAction).toHaveBeenCalledWith('demo', 'inv-1', 'approve');
    expect(refresh).toHaveBeenCalled();
    // A reload doesn't offer the same step again.
    cleanup();
    render(<BookieSuggestions orgKey="demo" suggestions={[approve]} />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('remembers a dismissal for the session', () => {
    const { unmount } = render(
      <BookieSuggestions orgKey="demo" suggestions={[approve, overdue]} />
    );
    fireEvent.click(screen.getByRole('button', { name: /Dismiss: Chase overdue invoices/ }));
    expect(screen.getAllByTestId('bookie-suggestion')).toHaveLength(1);
    unmount();
    render(<BookieSuggestions orgKey="demo" suggestions={[approve, overdue]} />);
    expect(screen.getAllByTestId('bookie-suggestion')).toHaveLength(1);
  });
});
