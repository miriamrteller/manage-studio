// @vitest-environment jsdom
/**
 * Bundled payments settings — equal Grow / iCount provider choice on one page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BundledPaymentsSettings } from '../features/settings/components/BundledPaymentsSettings';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    payment_provider: 'grow',
    invoicing_provider: 'grow',
    payment_provider_secret_configured: false,
  }),
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
});

describe('BundledPaymentsSettings', () => {
  it('shows generic page title and equal Grow / iCount / Invoice4U provider options', () => {
    renderSettings();

    expect(screen.getByRole('heading', { level: 1, name: 'Payments & invoices' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Grow' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'iCount' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Invoice4U' })).toBeTruthy();
  });

  it('switches credential form when admin selects the other provider', () => {
    renderSettings();

    expect(screen.getByLabelText('Grow user ID')).toBeTruthy();
    expect(screen.queryByLabelText('Company id (cid)')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'iCount' }));

    expect(screen.getByLabelText('Company id (cid)')).toBeTruthy();
    expect(screen.queryByLabelText('Grow user ID')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Invoice4U' }));

    expect(screen.getByLabelText('Organisation API key')).toBeTruthy();
    expect(screen.getByLabelText('Clearing company')).toBeTruthy();
    expect(screen.queryByLabelText('Company id (cid)')).toBeNull();
  });
});
