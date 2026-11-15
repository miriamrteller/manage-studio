// @vitest-environment jsdom
/**
 * "Cash collected": a teacher notes on the register that a pupil paid in cash (not a
 * payment), and the office confirms it under Finance → Payments with everything
 * prefilled. Fakes only (the database rules are in supabase/tests/teacher-logins).
 * Run: pnpm -C apps/web test teacher-cash-collected.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return q;
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: h.rpc,
    from: (table: string) => chain(table === 'offerings' ? [{ id: 'o1', name: 'Ballet 1', price_minor: 25000 }] : []),
    functions: { invoke: h.invoke },
  },
}));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1', currency: 'ILS' }) }));
vi.mock('@/features/finance/hooks/useManualPaymentMethods', () => ({
  useManualPaymentMethods: () => ['cash', 'bank_transfer'],
}));
vi.mock('@/components/shared/PersonSearchCombobox', () => ({ PersonSearchCombobox: () => null }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.name ? `${k}:${String(o.name)}` : k),
    i18n: { language: 'en' },
  }),
}));

import { CashCollected } from '@/features/attendance/components/CashCollected';
import { CashToConfirm, cashPaymentNote } from '@/features/finance-admin/components/CashToConfirm';
import { prefillItemKey } from '@/features/finance/components/RecordAnyPaymentForm';
import type { RegisterStudent } from '@/features/attendance/service';

afterEach(() => {
  cleanup();
  h.rpc.mockReset();
  h.invoke.mockReset();
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const pupil = (over: Partial<RegisterStudent> = {}): RegisterStudent => ({
  person_id: 'p1',
  name: 'Maya',
  enrolled: true,
  attended: true,
  cash: null,
  ...over,
});

describe('register: cash collected', () => {
  it('starts with the class price and saves a note, not a payment', async () => {
    h.rpc.mockResolvedValue({ data: 'n1', error: null });
    wrap(<CashCollected offeringId="o1" date="2026-11-16" student={pupil()} priceMinor={25000} currency="ILS" />);
    fireEvent.click(screen.getByTestId('cash-open'));
    const amount = screen.getByLabelText('attendance.cash.amount') as HTMLInputElement;
    expect(amount.value).toBe('250');
    fireEvent.change(screen.getByLabelText('attendance.cash.note'), { target: { value: ' at the door ' } });
    fireEvent.click(screen.getByText('attendance.cash.save'));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('set_cash_collected', {
        p_offering_id: 'o1',
        p_session_date: '2026-11-16',
        p_person_id: 'p1',
        p_amount_minor: 25000,
        p_note: 'at the door',
      }),
    );
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('shows a waiting note with undo, and paid once the office records it', async () => {
    wrap(
      <CashCollected
        offeringId="o1"
        date="2026-11-16"
        student={pupil({ cash: { status: 'waiting', amount_minor: 25000, note: null } })}
        priceMinor={25000}
        currency="ILS"
      />,
    );
    expect(screen.getByTestId('cash-waiting')).toBeTruthy();
    h.rpc.mockResolvedValue({ data: true, error: null });
    fireEvent.click(screen.getByText('attendance.cash.undo'));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('clear_cash_collected', { p_offering_id: 'o1', p_session_date: '2026-11-16', p_person_id: 'p1' }),
    );
    cleanup();
    wrap(
      <CashCollected
        offeringId="o1"
        date="2026-11-16"
        student={pupil({ cash: { status: 'paid', amount_minor: 25000, note: null } })}
        priceMinor={25000}
        currency="ILS"
      />,
    );
    expect(screen.getByTestId('cash-paid')).toBeTruthy();
  });
});

describe('office: cash to confirm', () => {
  const note = {
    id: 'n1',
    person_id: 'p1',
    person_name: 'Maya',
    offering_id: 'o1',
    class_name: 'Ballet 1',
    session_date: '2026-11-10',
    amount_minor: 25000,
    currency: 'ILS',
    note: 'at the door',
    teacher_name: 'Noa',
    created_at: '2026-11-10T16:00:00Z',
  };

  it('is hidden when there is nothing to confirm', async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    const { container } = wrap(<CashToConfirm />);
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('get_cash_to_confirm'));
    expect(container.textContent).toBe('');
  });

  it('records the payment prefilled, then closes the note with the payment', async () => {
    h.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === 'get_cash_to_confirm' ? [note] : null, error: null }),
    );
    h.invoke.mockResolvedValue({ data: { ok: true, paymentId: 'pay1' }, error: null });
    wrap(<CashToConfirm />);
    fireEvent.click(await screen.findByText('finance.cash_notes.mark_paid'));
    await screen.findByRole('option', { name: 'Ballet 1' });
    expect(screen.getByText('finance.cash_notes.record_title:Maya')).toBeTruthy();
    expect((screen.getByLabelText(/^finance\.record_payment\.amount/) as HTMLInputElement).value).toBe('250');
    expect((screen.getByLabelText(/^finance\.record_payment\.method/) as HTMLSelectElement).value).toBe('cash');
    expect((screen.getByLabelText(/^finance\.record_payment\.any\.date/) as HTMLInputElement).value).toBe('2026-11-10');
    fireEvent.click(screen.getByText('finance.record_payment.submit'));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('resolve_cash_note', { p_note_id: 'n1', p_outcome: 'paid', p_payment_id: 'pay1' }),
    );
    const [, { body }] = h.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(body).toMatchObject({ person_id: 'p1', offering_id: 'o1', amount_minor: 25000, method: 'cash', paid_on: '2026-11-10' });
  });

  it('"Not received" closes the note without a payment', async () => {
    h.rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === 'get_cash_to_confirm' ? [note] : null, error: null }),
    );
    wrap(<CashToConfirm />);
    fireEvent.click(await screen.findByText('finance.cash_notes.not_received'));
    await waitFor(() =>
      expect(h.rpc).toHaveBeenCalledWith('resolve_cash_note', { p_note_id: 'n1', p_outcome: 'not_received' }),
    );
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('starts with the class enrolment when the pupil has one open', () => {
    const open = [
      { kind: 'monthly' as const, key: 'monthly:e1', engagementId: 'e1', offeringId: 'o1', name: 'Ballet 1', amountMinor: 25000 },
    ];
    expect(prefillItemKey(open, 'o1')).toBe('monthly:e1');
    expect(prefillItemKey(open, 'o2')).toBe('offering:o2');
    expect(prefillItemKey(open, undefined)).toBeNull();
    expect(cashPaymentNote({ teacher_name: 'Noa', note: 'at the door' }, 'Cash collected by Noa')).toBe('Cash collected by Noa · at the door');
    expect(cashPaymentNote({ teacher_name: null, note: null }, 'x')).toBe('');
  });
});
