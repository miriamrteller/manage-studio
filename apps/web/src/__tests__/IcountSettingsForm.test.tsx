// @vitest-environment jsdom
/**
 * I3: iCount settings form saves via save_tenant_icount_credentials.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IcountSettingsForm } from '../features/settings/components/IcountSettingsForm';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ payment_provider: 'icount', payment_provider_secret_configured: false }),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <IcountSettingsForm />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  invoke.mockReset();
});

describe('IcountSettingsForm', () => {
  it('renders credential fields', () => {
    renderForm();
    expect(screen.getByLabelText('Company id (cid)')).toBeTruthy();
    expect(screen.getByLabelText('CC page id (cp)')).toBeTruthy();
    expect(screen.getByLabelText('API token')).toBeTruthy();
  });

  it('saves via save_tenant_icount_credentials when all fields are provided', async () => {
    rpc.mockResolvedValue({ error: null });
    renderForm();

    fireEvent.change(screen.getByLabelText('Company id (cid)'), { target: { value: 'cid-1' } });
    fireEvent.change(screen.getByLabelText('CC page id (cp)'), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText('API token'), { target: { value: 'tok-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('save_tenant_icount_credentials', {
        p_company_id: 'cid-1',
        p_page_id: '42',
        p_api_token: 'tok-1',
      }),
    );
  });
});
