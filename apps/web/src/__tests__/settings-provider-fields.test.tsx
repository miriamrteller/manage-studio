// @vitest-environment jsdom
/**
 * Settings → Payment / Invoicing show only the chosen provider's fields.
 * Pay at the studio = just the "how to pay" note; no invoicing service = no credentials.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ tenant: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn(), functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => h.tenant }));

import i18n from '@/i18n/i18n';
import { PaymentSettingsForm } from '@/features/settings/components/PaymentSettingsForm';
import { InvoicingSettingsForm } from '@/features/settings/components/InvoicingSettingsForm';

function renderIt(ui: ReactNode) {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

afterEach(cleanup);

describe('settings provider fields', () => {
  it('offline: only the how-to-pay note, no Stripe-style boxes', () => {
    h.tenant = { id: 't1', payment_provider: 'offline', invoicing_provider: 'none', offline_payment_instructions: '' };
    renderIt(<PaymentSettingsForm />);
    expect(screen.queryByLabelText('Publishable key')).toBeNull();
    expect(screen.queryByLabelText('Webhook secret')).toBeNull();
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('a card provider still shows its key fields', () => {
    h.tenant = { id: 't1', payment_provider: 'ypay', invoicing_provider: 'none' };
    renderIt(<PaymentSettingsForm />);
    expect(screen.getByLabelText('Webhook secret')).toBeInTheDocument();
  });

  it('no invoicing service: a plain note, no credential boxes', () => {
    h.tenant = { id: 't1', payment_provider: 'offline', invoicing_provider: 'none' };
    renderIt(<InvoicingSettingsForm />);
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    expect(screen.getByText(/not using an invoicing service/)).toBeInTheDocument();
  });

  it('an invoicing service shows its credential boxes', () => {
    h.tenant = { id: 't1', payment_provider: 'offline', invoicing_provider: 'icount' };
    renderIt(<InvoicingSettingsForm />);
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
  });
});
