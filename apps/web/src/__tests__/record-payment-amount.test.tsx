// @vitest-environment jsdom
/**
 * Recording a payment at the studio: the admin can enter a different amount (it starts at the
 * class price), sent to record-payment as amount_minor and audited against the class price.
 * Fakes only.
 * Run: pnpm -C apps/web test record-payment-amount.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

import { RecordPaymentModal, parseAmountToMinor } from '../features/finance/components/RecordPaymentModal';
import { recordManualRenewal } from '../../../../supabase/functions/_shared/payments/record-manual-renewal.ts';
import { makeGrowFakeService } from './helpers/growFakeService';

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('parseAmountToMinor', () => {
  it('reads whole and decimal amounts, with a dot or a comma', () => {
    expect(parseAmountToMinor('350')).toBe(35000);
    expect(parseAmountToMinor(' 350.5 ')).toBe(35050);
    expect(parseAmountToMinor('350,50')).toBe(35050);
  });
  it('refuses empty, zero, negative and malformed amounts', () => {
    for (const bad of ['', '0', '-5', 'abc', '1.234', '12.']) expect(parseAmountToMinor(bad)).toBeNull();
  });
});

describe('RecordPaymentModal amount', () => {
  it('starts at the class price and sends it', async () => {
    invoke.mockResolvedValue({ data: { ok: true, paymentId: 'p1' }, error: null });
    wrap(<RecordPaymentModal engagementId="eng-1" onRecorded={vi.fn()} defaultAmountMinor={35000} currency="ILS" />);
    const box = screen.getByLabelText(/finance.record_payment.amount/);
    expect(box).toHaveValue('350');
    fireEvent.click(screen.getByRole('button', { name: 'finance.record_payment.submit' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('record-payment', {
        body: expect.objectContaining({ engagement_id: 'eng-1', method: 'cash', amount_minor: 35000 }),
      }),
    );
  });

  it('sends a different amount the admin typed, and blocks an invalid one', async () => {
    invoke.mockResolvedValue({ data: { ok: true, paymentId: 'p1', period: '2026-12' }, error: null });
    wrap(<RecordPaymentModal kind="monthly" engagementId="eng-1" onRecorded={vi.fn()} defaultAmountMinor={35000} currency="ILS" />);
    const box = screen.getByLabelText(/finance.record_payment.amount/);
    const submit = screen.getByRole('button', { name: 'finance.record_payment.submit' });

    fireEvent.change(box, { target: { value: '0' } });
    expect(submit).toBeDisabled();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('finance.record_payment.amount_invalid')).toBeTruthy();

    fireEvent.change(box, { target: { value: '175.50' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('record-payment', {
        body: expect.objectContaining({ amount_minor: 17550 }),
      }),
    );
  });
});

describe('monthly fee with a different amount', () => {
  it('records the typed amount and audits it against the class price', async () => {
    const { service, tables } = makeGrowFakeService({
      tables: {
        billing_schedules: [{ id: 'sched-1', tenant_id: 't1', engagement_id: 'eng-1', billing_account_id: 'ba-1', next_billing_date: '2026-12-01', status: 'active' }],
        offerings: [{ id: 'off-1', price_minor: 35000, currency: 'ILS' }],
        tenants: [{ id: 't1', currency: 'ILS' }],
        people: [{ id: 'p1', account_id: null }],
      },
    });
    const result = await recordManualRenewal(
      service,
      {
        tenantId: 't1',
        engagement: { id: 'eng-1', person_id: 'p1', offering_id: 'off-1', billing_account_id: 'ba-1' },
        method: 'cash',
        amountMinor: 17500,
        actorUserId: 'admin-1',
      },
      { finalise: vi.fn(async () => undefined), priceMinor: (p) => p },
    );
    expect(result).toMatchObject({ ok: true });
    expect(tables.payments[0]).toMatchObject({ total_amount_minor: 17500, charge_type: 'renewal' });
    expect(tables.audit_log[0]).toMatchObject({
      action: 'manual_renewal_recorded',
      after_state: expect.objectContaining({ amount_minor: 17500, class_price_minor: 35000, amount_changed: true }),
    });
  });
});
