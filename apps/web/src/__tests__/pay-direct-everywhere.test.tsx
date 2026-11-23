// @vitest-environment jsdom
/**
 * Paying the studio directly, everywhere (owner, 23 Nov 2026: "it should be everywhere, also
 * for my ballet school"). The ways the studio switched on (Bit, bank transfer, cash, cheque)
 * show on every payment page: /pay links (shop orders, class cards, deposits) and the
 * enrolment / booking pay step when paying at the studio. Bit / bank transfer take a
 * screenshot; cash / cheque confirm. Nothing is required; card stays offered.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { PayDirectChoice } from '@/features/pay-direct/PayDirectChoice';
import { OfflinePaymentNotice } from '@/features/enrolment/components/OfflinePaymentNotice';
import type { PayDirectView } from '@/features/pay-direct/payDirectService';
import { renderInApp, setLanguage, setTenant } from './helpers/verticalHarness';

vi.mock('@/hooks/useTenant', async () => (await import('./helpers/fakeTenantState')).tenantHookMock());
vi.mock('@/hooks/useLanguage', async () => (await import('./helpers/fakeTenantState')).languageHookMock());
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), functions: { invoke: vi.fn() } } }));

const state = vi.hoisted(() => ({
  view: null as PayDirectView | null,
  get: vi.fn(),
  choose: vi.fn(async (..._a: unknown[]) => undefined),
  proof: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock('@/features/pay-direct/payDirectService', async (orig) => {
  const real = await orig<typeof import('@/features/pay-direct/payDirectService')>();
  return {
    ...real,
    PayDirectService: {
      ...real.PayDirectService,
      get: async (...a: unknown[]) => { state.get(...a); return state.view; },
      choose: (...a: unknown[]) => state.choose(...a),
      sendProof: (...a: unknown[]) => state.proof(...a),
    },
  };
});

const view = (over: Partial<PayDirectView> = {}): PayDirectView => ({
  ways: [
    { method: 'bit', details: '000-000-0000' },
    { method: 'bank', details: 'Account 1' },
    { method: 'cash', details: 'At the studio' },
  ],
  amountMinor: 25000,
  currency: 'ILS',
  payable: true,
  chosen: null,
  proofSentAt: null,
  ...over,
});

describe('Pay the studio directly on every payment page', () => {
  beforeEach(() => {
    setTenant('dance');
    setLanguage('en');
    state.view = view();
    state.get.mockReset();
    state.choose.mockClear();
    state.proof.mockClear();
  });

  it('/pay link with card: "Or pay the studio directly", Bit first with its number, screenshot asked', async () => {
    renderInApp(<PayDirectChoice target={{ token: 't'.repeat(48) }} alsoOnline />, { path: '/pay/x' });
    expect(await screen.findByRole('heading', { name: 'Or pay the studio directly' })).toBeTruthy();
    expect(state.get).toHaveBeenCalledWith({ token: 't'.repeat(48) });
    expect(screen.getByText('Bit to 000-000-0000')).toBeTruthy();
    expect(screen.getByText(/please send a screenshot/)).toBeTruthy();
    const file = new File(['x'], 'pay.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Send payment screenshot'), { target: { files: [file] } });
    await waitFor(() => expect(state.proof).toHaveBeenCalled());
    expect(state.proof.mock.calls[0][2]).toBe('bit');
  });

  it('cash: details and a confirm button, no screenshot', async () => {
    renderInApp(<PayDirectChoice target={{ token: 't'.repeat(48) }} />, { path: '/pay/x' });
    fireEvent.click(await screen.findByRole('radio', { name: 'Pay in cash' }));
    expect(screen.getByText('At the studio')).toBeTruthy();
    expect(screen.queryByLabelText('Send payment screenshot')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "Confirm: I'll pay this way" }));
    await waitFor(() => expect(state.choose).toHaveBeenCalledWith({ token: 't'.repeat(48) }, 'cash'));
  });

  it('nothing switched on, or already paid: shows nothing', async () => {
    state.view = view({ ways: [] });
    const { container } = renderInApp(<PayDirectChoice target={{ token: 't'.repeat(48) }} />, { path: '/pay/x' });
    await waitFor(() => expect(state.get).toHaveBeenCalled());
    expect(container.querySelector('section')).toBeNull();
  });

  it('ballet enrolment paid at the studio: the ways show under the pay-at-the-studio note', async () => {
    renderInApp(
      <OfflinePaymentNotice payDirectTarget={{ enrolment: { offering_id: 'c1', engagement_id: 'e1' } }} />,
      { path: '/enrol/pay' },
    );
    expect(await screen.findByRole('heading', { name: 'Pay the studio directly' })).toBeTruthy();
    expect(state.get).toHaveBeenCalledWith({ enrolment: { offering_id: 'c1', engagement_id: 'e1' } });
  });

  it('Hebrew', async () => {
    setLanguage('he');
    renderInApp(<PayDirectChoice target={{ token: 't'.repeat(48) }} />, { path: '/pay/x' });
    expect(await screen.findByRole('heading', { name: 'תשלום ישירות לסטודיו' })).toBeTruthy();
    expect(screen.getByText('בביט למספר 000-000-0000')).toBeTruthy();
  });
});
