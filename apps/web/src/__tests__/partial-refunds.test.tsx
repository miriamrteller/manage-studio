// @vitest-environment jsdom
/**
 * Partial refunds (owner-approved): both refund dialogs offer "Full refund" (default) or
 * "Partial refund" with an amount up to what is left; only a partial sends amount_minor. The
 * job row stays Paid with "Partly refunded" and keeps "Record refund" while money is left.
 * Fakes only.
 * Run: pnpm -C apps/web test partial-refunds.test.tsx
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { invoke, tenant } = vi.hoisted(() => ({
  invoke: vi.fn(),
  tenant: { id: 't1', invoicing_provider: 'green_invoice' } as Record<string, unknown>,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => tenant }));
vi.mock('@/features/finance/hooks/useManualPaymentMethods', () => ({
  useManualPaymentMethods: () => ['cash', 'bank_transfer', 'bit'],
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'remaining' in opts ? `${key}:${String(opts.remaining)}` : key,
    i18n: { language: 'en' },
  }),
}));

import { RefundPaymentModal } from '../features/finance/components/RefundPaymentModal';
import { ManualPaymentDialog } from '../features/jobs/components/ManualPaymentDialog';
import { JobPaymentRequestRow } from '../features/jobs/components/JobPaymentRequestRow';
import { refundAmountToSend, refundDocumentNoteKey } from '../features/finance/components/RefundAmountChoice';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const wrap = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);

describe('rules', () => {
  it('full sends nothing; partial sends the amount, up to what is left', () => {
    expect(refundAmountToSend({ kind: 'full', text: '' }, 35000)).toBeUndefined();
    expect(refundAmountToSend({ kind: 'partial', text: '100' }, 35000)).toBe(10000);
    expect(refundAmountToSend({ kind: 'partial', text: '350' }, 35000)).toBe(35000);
    expect(refundAmountToSend({ kind: 'partial', text: '350.01' }, 35000)).toBeNull();
    expect(refundAmountToSend({ kind: 'partial', text: '0' }, 35000)).toBeNull();
    expect(refundAmountToSend({ kind: 'partial', text: 'abc' }, 35000)).toBeNull();
  });

  it('says which document a refund gets, by the studio\'s invoicing', () => {
    expect(refundDocumentNoteKey('green_invoice')).toBe('finance.refund_payment.document_credit_note');
    expect(refundDocumentNoteKey('none')).toBe('finance.refund_payment.document_none');
    for (const p of ['grow', 'ypay', 'icount', 'invoice4u']) {
      expect(refundDocumentNoteKey(p)).toBe('finance.refund_payment.document_in_provider');
    }
  });
});

describe('RefundPaymentModal', () => {
  const modal = (alreadyRefundedMinor = 0) =>
    wrap(
      <RefundPaymentModal
        paymentId="pay-1"
        totalMinor={35000}
        alreadyRefundedMinor={alreadyRefundedMinor}
        currency="ILS"
        provider="grow"
        onRefunded={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

  it('a full refund sends no amount (the server refunds what is left)', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    modal();
    expect(screen.getByRole('radio', { name: 'finance.refund_payment.full' })).toBeChecked();
    expect(screen.getByText('finance.refund_payment.document_credit_note')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'finance.refund_payment.submit' }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body).not.toHaveProperty('amount_minor');
  });

  it('a partial refund sends the typed amount; over what is left is refused', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    modal(10000);
    expect(screen.getByText(/^finance.refund_payment.already_refunded/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'finance.refund_payment.partial' }));
    const box = screen.getByLabelText('finance.refund_payment.partial_amount') as HTMLInputElement;
    expect(box.value).toBe('250'); // what is left
    fireEvent.change(box, { target: { value: '260' } });
    expect(screen.getByRole('alert').textContent).toContain('finance.refund_payment.partial_invalid');
    expect(screen.getByRole('button', { name: 'finance.refund_payment.submit' })).toBeDisabled();
    fireEvent.change(box, { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'finance.refund_payment.submit' }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0][1].body).toMatchObject({ payment_id: 'pay-1', amount_minor: 10000 });
  });
});

describe('job refund', () => {
  const request = (payment: Record<string, unknown> | null = { id: 'p1', total_amount_minor: 50000, refund_amount_minor: 0 }) =>
    ({
      id: 'jpr-1', tenant_id: 't1', engagement_id: 'e1', label: 'Deposit', amount_minor: 50000, currency: 'ILS',
      due_date: null, status: 'paid', payment_id: 'p1', sent_at: null, paid_at: '2026-11-01', max_installments: 1,
      public_token: 'tok', refunded_at: null, created_at: '2026-10-01',
      payment: payment && { payment_method: 'bank_transfer', invoice_url: null, external_document_number: null, status: 'succeeded', ...payment },
    }) as never;

  it('records a partial refund with the amount, and a second one up to what is left', async () => {
    const onRefund = vi.fn().mockResolvedValue(undefined);
    const { rerender } = wrap(
      <ManualPaymentDialog action={{ kind: 'refund', request: request() }} language="en" isSubmitting={false}
        onClose={vi.fn()} onMarkPaid={vi.fn()} onRefund={onRefund} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'finance.refund_payment.partial' }));
    fireEvent.change(screen.getByLabelText('finance.refund_payment.partial_amount'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'pages.jobs.payments.manual.confirmRefund' }));
    await waitFor(() => expect(onRefund).toHaveBeenCalledWith('p1', undefined, 20000));

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ManualPaymentDialog action={{ kind: 'refund', request: request({ id: 'p1', total_amount_minor: 50000, refund_amount_minor: 20000 }) }}
          language="en" isSubmitting={false} onClose={vi.fn()} onMarkPaid={vi.fn()} onRefund={onRefund} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'finance.refund_payment.partial' }));
    fireEvent.change(screen.getByLabelText('finance.refund_payment.partial_amount'), { target: { value: '301' } });
    expect(screen.getByRole('button', { name: 'pages.jobs.payments.manual.confirmRefund' })).toBeDisabled();
  });

  it('a full job refund sends no amount', async () => {
    const onRefund = vi.fn().mockResolvedValue(undefined);
    wrap(
      <ManualPaymentDialog action={{ kind: 'refund', request: request() }} language="en" isSubmitting={false}
        onClose={vi.fn()} onMarkPaid={vi.fn()} onRefund={onRefund} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'pages.jobs.payments.manual.confirmRefund' }));
    await waitFor(() => expect(onRefund).toHaveBeenCalledWith('p1', undefined, undefined));
  });

  it('the job row stays Paid with "Partly refunded" and keeps Record refund while money is left', () => {
    const row = (payment: Record<string, unknown>) =>
      render(
        <ul>
          <JobPaymentRequestRow request={request(payment)} language="en" clientPhone={null} studioName="S" busy={false}
            onSendLink={vi.fn()} onMarkPaid={vi.fn()} onRefund={vi.fn()} onCancel={vi.fn()} onReopen={vi.fn()} />
        </ul>,
      );
    row({ id: 'p1', total_amount_minor: 50000, refund_amount_minor: 20000 });
    expect(screen.getByText('pages.jobs.payments.partlyRefunded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'pages.jobs.payments.recordRefund' })).toBeTruthy();
    cleanup();
    row({ id: 'p1', total_amount_minor: 50000, refund_amount_minor: 50000 });
    expect(screen.queryByRole('button', { name: 'pages.jobs.payments.recordRefund' })).toBeNull();
  });
});

describe('process-refund arithmetic (server)', () => {
  it('partial then the rest; a partial keeps a job request paid (gallery gate unchanged)', async () => {
    const { planRefund } = await import('../../../../supabase/functions/_shared/payments/refund-amounts.ts');
    const first = planRefund({ totalMinor: 50000, alreadyRefundedMinor: 0, requestedMinor: 20000 });
    expect(first).toEqual({ ok: true, amountMinor: 20000, newRefundTotal: 20000, newStatus: 'partially_refunded', releasesJobRequest: false });
    expect(planRefund({ totalMinor: 50000, alreadyRefundedMinor: 20000, requestedMinor: 30001 })).toEqual({ ok: false });
    const rest = planRefund({ totalMinor: 50000, alreadyRefundedMinor: 20000 });
    expect(rest).toEqual({ ok: true, amountMinor: 30000, newRefundTotal: 50000, newStatus: 'refunded', releasesJobRequest: true });
    expect(planRefund({ totalMinor: 50000, alreadyRefundedMinor: 50000 })).toEqual({ ok: false });
    expect(planRefund({ totalMinor: 50000, alreadyRefundedMinor: null, requestedMinor: 0 })).toEqual({ ok: false });
  });
});
