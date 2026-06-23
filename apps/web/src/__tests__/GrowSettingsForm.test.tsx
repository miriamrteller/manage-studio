// @vitest-environment jsdom
/**
 * G7: the Grow settings form renders, gates save until all fields are filled, and saves via the
 * save_tenant_grow_credentials RPC.
 * Run: pnpm -C apps/web test GrowSettingsForm.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GrowSettingsForm } from '../features/settings/components/GrowSettingsForm';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ payment_provider: 'grow', payment_provider_secret_configured: false }),
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
      <GrowSettingsForm />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  rpc.mockReset();
  invoke.mockReset();
});

describe('GrowSettingsForm', () => {
  it('renders the credential fields', () => {
    renderForm();
    expect(screen.getByLabelText('Grow user ID')).toBeTruthy();
    expect(screen.getByLabelText('Page code')).toBeTruthy();
    expect(screen.getByLabelText('API key')).toBeTruthy();
  });

  it('disables save until every field is filled', () => {
    renderForm();
    const save = screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('saves via save_tenant_grow_credentials when all fields are provided', async () => {
    rpc.mockResolvedValue({ error: null });
    renderForm();

    fireEvent.change(screen.getByLabelText('Grow user ID'), { target: { value: 'user-1' } });
    fireEvent.change(screen.getByLabelText('Page code'), { target: { value: 'page-1' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'key-1' } });

    const save = screen.getByRole('button', { name: 'common.save' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('save_tenant_grow_credentials', {
        p_user_id: 'user-1',
        p_page_code: 'page-1',
        p_api_key: 'key-1',
      }),
    );
  });
});
