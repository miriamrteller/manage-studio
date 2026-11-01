// @vitest-environment jsdom
/**
 * Offline-only studio settings: the instructions textarea loads the saved text and saves
 * the trimmed value (empty → NULL) on the tenant row.
 * Run: pnpm -C apps/web test OfflinePaymentSettingsForm.test.tsx
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfflinePaymentSettingsForm } from '../features/settings/components/OfflinePaymentSettingsForm';

const { update, eq } = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn() }));

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
  useTenant: () => ({
    id: 'tenant-1',
    payment_provider: 'none',
    offline_payment_instructions: 'Old text',
  }),
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
});

function renderForm() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <OfflinePaymentSettingsForm />
    </QueryClientProvider>,
  );
}

describe('OfflinePaymentSettingsForm', () => {
  it('loads the saved instructions into a labelled textarea', () => {
    renderForm();
    const box = screen.getByLabelText('settings.offline_payments.instructions_label');
    expect(box).toHaveValue('Old text');
  });

  it('saves the trimmed text on the tenant row', async () => {
    eq.mockResolvedValue({ error: null });
    renderForm();
    const box = screen.getByLabelText('settings.offline_payments.instructions_label');
    fireEvent.change(box, { target: { value: '  Bank 12-345  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith({ offline_payment_instructions: 'Bank 12-345' }));
    expect(eq).toHaveBeenCalledWith('id', 'tenant-1');
    expect(await screen.findByRole('status')).toHaveTextContent('settings.offline_payments.saved');
  });

  it('stores NULL when the text is cleared', async () => {
    eq.mockResolvedValue({ error: null });
    renderForm();
    const box = screen.getByLabelText('settings.offline_payments.instructions_label');
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ offline_payment_instructions: null }));
  });
});
