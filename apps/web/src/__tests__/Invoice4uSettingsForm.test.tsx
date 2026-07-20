// @vitest-environment jsdom
/**
 * U3 — Invoice4uSettingsForm saves credentials via RPC and exposes health check.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Invoice4uSettingsForm } from '../features/settings/components/Invoice4uSettingsForm';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({
    payment_provider: 'invoice4u',
    invoicing_provider: 'invoice4u',
    payment_provider_secret_configured: false,
    payment_provider_public_key: '7',
  }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Invoice4uSettingsForm />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  invoke.mockReset();
});

describe('Invoice4uSettingsForm (U3)', () => {
  it('saves credentials via save_tenant_invoice4u_credentials', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    renderForm();

    fireEvent.change(screen.getByLabelText('Organisation API key'), {
      target: { value: '11111111-1111-1111-1111-111111111111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('save_tenant_invoice4u_credentials', {
        p_api_key: '11111111-1111-1111-1111-111111111111',
        p_clearing_company_type: '7',
        p_account_label: undefined,
      }),
    );
  });

  it('defaults clearing company to Meshulam (7)', () => {
    renderForm();
    const select = screen.getByLabelText('Clearing company') as HTMLSelectElement;
    expect(select.value).toBe('7');
  });
});
