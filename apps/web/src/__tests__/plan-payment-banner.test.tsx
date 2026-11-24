// @vitest-environment jsdom
/**
 * The banner a studio admin sees after their OpalSwift plan charge was declined (step B3):
 * information only, closable, and back again after a new decline.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';

const h = vi.hoisted(() => ({
  sub: { failed_attempts: 0, next_charge_on: '2026-12-01' } as { failed_attempts: number; next_charge_on: string | null },
}));

vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ id: 't1' }) }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(async () => ({ data: [h.sub], error: null })) } }));

import i18n from '@/i18n/i18n';
import { PlanPaymentBanner } from '@/components/billing/PlanPaymentBanner';

function renderIt() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PlanPaymentBanner />
        </MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(async () => {
  window.sessionStorage.clear();
  await i18n.changeLanguage('en');
});
afterEach(cleanup);

describe('PlanPaymentBanner', () => {
  it('shows nothing when no charge failed', async () => {
    h.sub = { failed_attempts: 0, next_charge_on: '2026-12-01' };
    const { container } = renderIt();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
  });

  it('says when we try again and links to the card', async () => {
    h.sub = { failed_attempts: 1, next_charge_on: '2026-12-01' };
    renderIt();
    expect(await screen.findByText("We couldn't charge your card for your OpalSwift plan.")).toBeInTheDocument();
    expect(screen.getByText(/We'll try again on/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update your card' })).toHaveAttribute('href', '/admin/settings/payments');
  });

  it('asks for a new card after the last try, and can be closed', async () => {
    h.sub = { failed_attempts: 3, next_charge_on: '2026-12-01' };
    renderIt();
    expect(await screen.findByText(/Add a new card so we can try again/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Add a new card/)).not.toBeInTheDocument();
  });
});
