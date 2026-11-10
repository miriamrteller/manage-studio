// @vitest-environment jsdom
/**
 * Bundled payments settings (Grow / Invoice4U on one page). Beta rule: a studio already on a
 * provider keeps it (support changes it); a studio paying at the studio with no tax documents
 * picks among the finished providers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BundledPaymentsSettings,
  bundledProviderChoices,
} from '../features/settings/components/BundledPaymentsSettings';

const { rpc, invoke, tenantState } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  tenantState: {} as Record<string, unknown>,
}));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ payment_provider_secret_configured: false, ...tenantState }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BundledPaymentsSettings />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  invoke.mockReset();
  for (const k of Object.keys(tenantState)) delete tenantState[k];
});

describe('bundledProviderChoices', () => {
  it('keeps a studio on its provider and offers no new one (Grow and Invoice4U are hidden)', () => {
    expect(bundledProviderChoices({ payment_provider: 'grow', invoicing_provider: 'grow' })).toEqual(['grow']);
    expect(bundledProviderChoices({ payment_provider: 'icount', invoicing_provider: 'icount' })).toEqual(['icount']);
    expect(bundledProviderChoices({ payment_provider: 'offline', invoicing_provider: 'none' })).toEqual([]);
    expect(bundledProviderChoices({ payment_provider: 'offline', invoicing_provider: 'none' }, false)).toEqual([]);
    expect(bundledProviderChoices({ payment_provider: 'offline', invoicing_provider: 'ypay' })).toEqual([]);
    expect(bundledProviderChoices({ payment_provider: 'ypay', invoicing_provider: 'ypay' })).toEqual([]);
  });
});

describe('BundledPaymentsSettings', () => {
  it('a Grow studio sees only its Grow details and the support message', () => {
    Object.assign(tenantState, { payment_provider: 'grow', invoicing_provider: 'grow' });
    renderSettings();

    expect(screen.getByRole('heading', { level: 1, name: 'Payments & invoices' })).toBeTruthy();
    expect(screen.getByLabelText('Grow user ID')).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent('settings.offline_payments.switch_contact_support');
  });

  it('a studio paying at the studio is not offered Grow or Invoice4U here', () => {
    Object.assign(tenantState, { payment_provider: 'offline', invoicing_provider: 'none' });
    renderSettings();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByLabelText('Grow user ID')).toBeNull();
    expect(screen.queryByLabelText('Organisation API key')).toBeNull();
  });

  it('a YPay studio cannot connect a bundled provider here', () => {
    Object.assign(tenantState, { payment_provider: 'ypay', invoicing_provider: 'ypay' });
    renderSettings();
    expect(screen.getByRole('note')).toHaveTextContent('settings.offline_payments.switch_contact_support');
    expect(screen.queryByLabelText('Grow user ID')).toBeNull();
    expect(screen.queryByLabelText('Organisation API key')).toBeNull();
  });
});
