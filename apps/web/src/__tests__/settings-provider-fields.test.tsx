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
    expect(screen.getByRole('radio', { name: 'Not a registered business yet: pay at the studio' })).toBeChecked();
  });

  it('a card provider still shows its key fields, and the studio can switch back to pay at the studio', () => {
    h.tenant = { id: 't1', payment_provider: 'tranzila', invoicing_provider: 'none' };
    renderIt(<PaymentSettingsForm />);
    expect(screen.getByLabelText('Webhook secret')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('Grow not connected yet: a clear "not connected" note and a Connect button, nothing broken', () => {
    h.tenant = { id: 't1', payment_provider: 'grow', invoicing_provider: 'grow', payment_provider_secret_configured: false };
    renderIt(<PaymentSettingsForm />);
    expect(screen.getByText(/Not connected yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect now' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('Grow connected: says so', () => {
    h.tenant = { id: 't1', payment_provider: 'grow', invoicing_provider: 'grow', payment_provider_secret_configured: true };
    renderIt(<PaymentSettingsForm />);
    expect(screen.getByText(/Customers can pay by card online/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage connection' })).toBeInTheDocument();
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
