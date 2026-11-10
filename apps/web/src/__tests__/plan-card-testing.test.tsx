// @vitest-environment jsdom
/**
 * Settings → Payments, "Your OpalSwift plan: card (testing)": dev website only; shows the card
 * on file and opens OpalSwift's Takbull page from platform-billing-card.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  devSite: true,
  sub: null as Record<string, unknown> | null,
  rpc: vi.fn(),
  invoke: vi.fn(),
  assign: vi.fn(),
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1' }) }));
vi.mock('@/lib/devStudioPicker', () => ({ isDevSite: () => h.devSite }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: h.rpc, functions: { invoke: h.invoke } } }));

import i18n from '@/i18n/i18n';
import { PlanCardTestingForm } from '@/features/settings/components/PlanCardTestingForm';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PlanCardTestingForm />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  h.devSite = true;
  h.sub = { card_last4: null, card_expiry: null, next_charge_on: null, last_payment_status: null, last_payment_agorot: null };
  h.rpc.mockReset().mockImplementation(async () => ({ data: h.sub ? [h.sub] : [], error: null }));
  h.invoke.mockReset().mockResolvedValue({ data: { ok: true, url: 'https://takbull.example/PaymentGateway?orderUniqId=u1' }, error: null });
  h.assign.mockReset();
  Object.defineProperty(window, 'location', { value: { ...window.location, search: '', assign: h.assign }, writable: true });
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

describe('plan card (testing)', () => {
  it('is not shown on the live site', () => {
    h.devSite = false;
    const { container } = renderIt();
    expect(container).toBeEmptyDOMElement();
  });

  it('says when no card is added, and opens Takbull\'s page', async () => {
    renderIt();
    expect(await screen.findByText('No card added yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    await waitFor(() => expect(h.assign).toHaveBeenCalledWith('https://takbull.example/PaymentGateway?orderUniqId=u1'));
    expect(h.invoke).toHaveBeenCalledWith('platform-billing-card', { body: {} });
  });

  it('shows the card on file and the next charge', async () => {
    h.sub = { card_last4: '4242', card_expiry: '12/30', next_charge_on: '2026-12-01', last_payment_status: 'succeeded', last_payment_agorot: 100 };
    renderIt();
    expect(await screen.findByText(/•••• 4242 12\/30/)).toBeInTheDocument();
    expect(screen.getByText(/^Next charge:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use another card' })).toBeInTheDocument();
  });

  it('explains when this month is already paid', async () => {
    h.invoke.mockResolvedValue({ data: { ok: false, code: 'already_paid' }, error: null });
    renderIt();
    await screen.findByText('No card added yet.');
    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already paid');
    expect(h.assign).not.toHaveBeenCalled();
  });
});
