// @vitest-environment jsdom
/**
 * Admin "Tax documents" toggle: off shows the registered-business note and saves 'none';
 * on shows the provider select and saves the chosen slug.
 * Run: pnpm -C apps/web test InvoicingToggleForm.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoicingToggleForm } from '../features/settings/components/InvoicingToggleForm';

const { update, eq, tenantState } = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  tenantState: { invoicing_provider: 'none', payment_provider: 'none' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        update(payload);
        return { eq: (...args: unknown[]) => eq(...args) };
      },
    }),
  },
}));
vi.mock('@/hooks/useTenant', () => ({
  useTenant: () => ({ id: 'tenant-1', ...tenantState }),
}));
vi.mock('@/lib/query-client', () => ({ default: { invalidateQueries: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

afterEach(() => {
  cleanup();
  update.mockReset();
  eq.mockReset();
  tenantState.invoicing_provider = 'none';
  tenantState.payment_provider = 'none';
});

function renderForm() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <InvoicingToggleForm />
    </QueryClientProvider>,
  );
}

describe('InvoicingToggleForm', () => {
  it('shows invoicing off with the registered-business note', () => {
    renderForm();
    expect(screen.getByRole('checkbox', { name: /enabled_label/ })).not.toBeChecked();
    expect(screen.getByRole('note')).toHaveTextContent('settings.invoicing_toggle.off_note');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('turning on reveals the provider select and saves the chosen slug', async () => {
    eq.mockResolvedValue({ error: null });
    renderForm();
    fireEvent.click(screen.getByRole('checkbox', { name: /enabled_label/ }));
    const select = screen.getByRole('combobox', { name: 'settings.invoicing.provider' });
    fireEvent.change(select, { target: { value: 'icount' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ invoicing_provider: 'icount' }));
    expect(eq).toHaveBeenCalledWith('id', 'tenant-1');
  });

  it('turning off a grow tenant saves none', async () => {
    tenantState.invoicing_provider = 'grow';
    tenantState.payment_provider = 'grow';
    eq.mockResolvedValue({ error: null });
    renderForm();
    const box = screen.getByRole('checkbox', { name: /enabled_label/ });
    expect(box).toBeChecked();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ invoicing_provider: 'none' }));
    expect(await screen.findByRole('status')).toHaveTextContent('settings.invoicing_toggle.saved');
  });
});
