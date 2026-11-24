// @vitest-environment jsdom
/**
 * A photo order's payment page (owner, 22 Nov 2026): only the ways the studio switched on;
 * Bit / bank transfer show their details and take the payment screenshot; cash / cheque
 * just confirm. Run: pnpm -C apps/web test photo-order-payment-page
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import PhotoOrderPaymentPage from '@/pages/PhotoOrderPaymentPage';
import type { PhotoOrderPayment } from '@/features/jobs/services/clientPhotoShopService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  page: null as PhotoOrderPayment | null,
  proof: vi.fn(async (..._a: unknown[]) => undefined),
  method: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock('@/features/jobs/services/clientPhotoShopService', async (orig) => {
  const real = await orig<typeof import('@/features/jobs/services/clientPhotoShopService')>();
  return {
    ...real,
    ClientPhotoShopService: {
      payment: async () => state.page,
      sendProof: (...a: unknown[]) => state.proof(...a),
      chooseMethod: (...a: unknown[]) => state.method(...a),
    },
  };
});

const order = {
  id: 'o1', status: 'awaiting_payment' as const, photo_count: 2, included_count: 0, total_minor: 6000, currency: 'ILS',
  created_at: '2026-11-22T10:00:00Z', paid_at: null, delivered_at: null, pay_token: null, delivery_url: null,
  pay_by_cash: true, proof_requested: true, pay_method: null, proof_sent_at: null,
};

const open = () =>
  renderInApp(<PhotoOrderPaymentPage />, {
    path: '/dashboard/portal/photo-order/:engagementId/:orderId',
    initialEntry: '/dashboard/portal/photo-order/e1/o1',
  });

describe('PhotoOrderPaymentPage', () => {
  beforeEach(async () => {
    setTenant('photographer');
    await setLanguage('en');
    state.proof.mockClear();
    state.method.mockClear();
    state.page = {
      studioName: 'Studio',
      order,
      card_payments: false,
      pay_direct: {
        ways: [
          { method: 'bit', details: '050-0000000' },
          { method: 'bank', details: 'Bank 12, branch 345' },
          { method: 'cash', details: 'Pay at the studio' },
        ],
      },
    };
  });

  it('lists only the ways switched on and shows the chosen one\'s details', async () => {
    open();
    expect((await screen.findByLabelText('Pay by Bit') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText('Pay by bank transfer')).toBeTruthy();
    expect(screen.getByLabelText('Pay in cash')).toBeTruthy();
    expect(screen.queryByLabelText('Pay by cheque')).toBeNull();
    expect(screen.getByText('Bit to 050-0000000')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Pay by bank transfer'));
    expect(screen.getByText('Bank 12, branch 345')).toBeTruthy();
    expect(screen.queryByText('Bit to 050-0000000')).toBeNull();
  });

  it('Bit / bank transfer: sends the screenshot with the chosen way', async () => {
    open();
    fireEvent.click(await screen.findByLabelText('Pay by bank transfer'));
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'paid.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Send payment screenshot'), { target: { files: [file] } });
    await waitFor(() => expect(state.proof).toHaveBeenCalledWith('e1', 'o1', file, 'bank'));
  });

  it('cash: no screenshot, the client confirms', async () => {
    open();
    fireEvent.click(await screen.findByLabelText('Pay in cash'));
    expect(screen.getByText('Pay at the studio')).toBeTruthy();
    expect(screen.queryByLabelText('Send payment screenshot')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Confirm: I'll pay this way" }));
    await waitFor(() => expect(state.method).toHaveBeenCalledWith('e1', 'o1', 'cash'));
  });

  it('a paid order says so', async () => {
    state.page = { ...state.page!, order: { ...order, status: 'paid' } };
    open();
    expect(await screen.findByText('The studio has recorded your payment. Thank you.')).toBeTruthy();
  });
});
