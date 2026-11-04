// @vitest-environment jsdom
/**
 * Finance -> Payments -> "Record a payment": who paid, what it's for, amount, method, date and
 * note. Picking an item records it the way that item's own screen does; anything else is a
 * standalone payment; someone not in the list is added by name. Nothing blocks.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { paidAtFor } from '../../../../supabase/functions/_shared/payments/paid-on';
import {
  StandalonePaymentSchema,
  standalonePaymentRow,
} from '../../../../supabase/functions/_shared/payments/record-standalone-payment';
import { openItemsFrom } from '@/features/finance/hooks/usePayableItems';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  tables: {} as Record<string, unknown[]>,
  chosen: null as null | { id: string; name: string },
}));

function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'in', 'order', 'limit']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return q;
}
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => chain(h.tables[table] ?? []),
    functions: { invoke: h.invoke },
  },
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 'tenant-1', currency: 'ILS', invoicing_provider: 'none' }),
}));
vi.mock('@/features/finance/hooks/useManualPaymentMethods', () => ({
  useManualPaymentMethods: () => ['cash', 'bank_transfer', 'bit'],
}));
vi.mock('@/components/shared/PersonSearchCombobox', () => ({
  PersonSearchCombobox: ({ onSelect, label }: { onSelect: (p: unknown) => void; label: string }) => (
    <button type="button" onClick={() => h.chosen && onSelect(h.chosen)}>
      {`pick:${label}`}
    </button>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.name ? `${k}:${o.name}` : k),
    i18n: { language: 'en' },
  }),
}));

import { RecordAnyPaymentForm, localToday, recordPaymentRequest } from '@/features/finance/components/RecordAnyPaymentForm';

afterEach(() => {
  cleanup();
  h.invoke.mockReset();
  h.tables = {};
  h.chosen = null;
});

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <RecordAnyPaymentForm onRecorded={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('payment date', () => {
  const now = new Date('2026-11-04T10:00:00Z');
  it('today (or tomorrow in UTC) is now; an earlier day is noon UTC; later or over a year ago is refused', () => {
    expect(paidAtFor(undefined, now)).toEqual({ ok: true, paidAt: now.toISOString() });
    expect(paidAtFor('2026-11-04', now)).toEqual({ ok: true, paidAt: now.toISOString() });
    expect(paidAtFor('2026-11-05', now)).toEqual({ ok: true, paidAt: now.toISOString() });
    expect(paidAtFor('2026-11-01', now)).toEqual({ ok: true, paidAt: '2026-11-01T12:00:00.000Z' });
    expect(paidAtFor('2026-11-07', now).ok).toBe(false);
    expect(paidAtFor('2025-10-01', now).ok).toBe(false);
    expect(paidAtFor('2026-02-30', now).ok).toBe(false);
  });
});

describe('where the payment goes', () => {
  const base = { amountMinor: 35000, method: 'cash' as const, note: '', paidOn: '2026-11-04', today: '2026-11-04', sendConfirmation: true };
  it('an enrolment, monthly plan or booking goes through record-payment with the enrolment', () => {
    expect(
      recordPaymentRequest({
        ...base,
        payer: { personId: 'p1', name: 'Dana' },
        item: { kind: 'monthly', key: 'monthly:e1', engagementId: 'e1', name: 'Ballet', amountMinor: 35000 },
      }),
    ).toEqual({ fn: 'record-payment', body: { engagement_id: 'e1', amount_minor: 35000, method: 'cash' } });
  });
  it('a project payment goes through record-job-payment', () => {
    expect(
      recordPaymentRequest({
        ...base,
        paidOn: '2026-11-01',
        payer: { personId: 'p1', name: 'Dana' },
        item: { kind: 'job', key: 'job:r1', requestId: 'r1', name: 'Deposit', amountMinor: 50000 },
      }),
    ).toEqual({ fn: 'record-job-payment', body: { request_id: 'r1', method: 'cash', paid_on: '2026-11-01' } });
  });
  it('anything else is a standalone payment, with the offering when one is picked', () => {
    expect(
      recordPaymentRequest({
        ...base,
        note: ' Workshop ',
        sendConfirmation: false,
        payer: { newName: ' Noa ', newEmail: '' },
        item: { kind: 'offering', key: 'offering:o1', offeringId: 'o1', name: 'Workshop', amountMinor: 12000 },
      }),
    ).toEqual({
      fn: 'record-payment',
      body: { new_person: { name: 'Noa' }, offering_id: 'o1', amount_minor: 35000, method: 'cash', note: 'Workshop', send_confirmation: false },
    });
  });
});

describe('open items and the standalone row', () => {
  it('lists first payments, monthly plans and open project payments only', () => {
    const items = openItemsFrom(
      [
        { id: 'e1', status: 'pending_payment', offering: { id: 'o1', name: 'Ballet', price_minor: 30000, billing_mode: 'one_time' } },
        { id: 'e2', status: 'active', offering: { id: 'o2', name: 'Jazz', price_minor: 25000, billing_mode: 'recurring' } },
        { id: 'e3', status: 'active', offering: { id: 'o3', name: 'Paid once', price_minor: 1000, billing_mode: 'one_time' } },
      ],
      [
        { id: 'r1', label: 'Deposit', amount_minor: 50000, status: 'sent' },
        { id: 'r2', label: 'Balance', amount_minor: 50000, status: 'paid' },
      ],
    );
    expect(items.map((i) => i.key)).toEqual(['first:e1', 'monthly:e2', 'job:r1']);
  });

  it('a standalone payment always has a payer, and is a manual, succeeded initial payment', () => {
    expect(StandalonePaymentSchema.safeParse({ amount_minor: 100, method: 'cash' }).success).toBe(false);
    expect(StandalonePaymentSchema.safeParse({ new_person: { name: 'Noa' }, amount_minor: 100, method: 'bit' }).success).toBe(true);
    const row = standalonePaymentRow({
      tenantId: 't', personId: 'p', accountId: null, offering: { id: 'o', name: 'Workshop' }, amountMinor: 100,
      currency: 'ils', method: 'bit', paidAt: '2026-11-04T10:00:00.000Z', actorUserId: 'u', ref: 'r',
    });
    expect(row).toMatchObject({
      person_id: 'p', offering_id: 'o', engagement_id: null, provider: 'manual', status: 'succeeded',
      charge_type: 'initial', currency: 'ILS', payment_method: 'bit', description: 'Workshop — manual Bit / PayBox',
    });
  });
});

describe('the form', () => {
  it('someone not in the list: added by name, a standalone "Other" payment, prefilled with today and the last method', async () => {
    h.tables.payments = [{ payment_method: 'bank_transfer' }];
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    wrap();
    expect(screen.getByRole('button', { name: 'finance.record_payment.submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.any.not_in_list' }));
    fireEvent.change(screen.getByLabelText('finance.record_payment.any.new_name'), { target: { value: 'Noa' } });
    fireEvent.change(screen.getByLabelText(/finance.record_payment.amount/), { target: { value: '120' } });
    expect(screen.getByLabelText('finance.record_payment.any.date')).toHaveValue(localToday());
    await waitFor(() => expect(screen.getByLabelText('finance.record_payment.method')).toHaveValue('bank_transfer'));
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.submit' }));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('record-payment', {
        body: { new_person: { name: 'Noa' }, amount_minor: 12000, method: 'bank_transfer' },
      }),
    );
  });

  it("a client's open items come first; picking one prefills its amount and records it there", async () => {
    h.chosen = { id: 'p1', name: 'Dana' };
    h.tables.engagements = [
      { id: 'e1', status: 'pending_payment', offering: { id: 'o1', name: 'Ballet', price_minor: 30000, billing_mode: 'one_time' } },
    ];
    h.tables.offerings = [{ id: 'o9', name: 'Workshop', price_minor: 9000 }];
    h.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    wrap();
    fireEvent.click(screen.getByRole('button', { name: 'pick:finance.record_payment.any.client' }));
    await waitFor(() => expect(screen.getByLabelText('finance.record_payment.any.for')).toHaveValue('first:e1'));
    expect(screen.getByLabelText(/finance.record_payment.amount/)).toHaveValue('300');
    fireEvent.change(screen.getByLabelText('finance.record_payment.any.for'), { target: { value: 'offering:o9' } });
    expect(screen.getByLabelText(/finance.record_payment.amount/)).toHaveValue('90');
    fireEvent.change(screen.getByLabelText('finance.record_payment.any.for'), { target: { value: 'first:e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.submit' }));
    await waitFor(() =>
      expect(h.invoke).toHaveBeenCalledWith('record-payment', {
        body: { engagement_id: 'e1', amount_minor: 30000, method: 'cash' },
      }),
    );
  });
});
